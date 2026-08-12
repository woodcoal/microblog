/** Shared SSR model for the canonical post-detail route. */
import type { APIContext } from 'astro';

import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { renderMarkdown, renderFullMarkdown } from '@/lib/markdown';
import { checkPostVisibility } from '@/lib/visibility';
import { SITE_URL, SITE_TITLE, MAX_USER_PINNED_POSTS, getModeLabel } from '@/lib/config';
import { resolveUsername } from '@/lib/user';
import { createGoneResponse, createNoindexNotFoundResponse, getCanonicalUrl } from '@/lib/seo';

export const POST_DETAIL_MODES = ['weibo', 'forum', 'blog'] as const;
export type PostDetailMode = (typeof POST_DETAIL_MODES)[number];
type PostDetailContext = Pick<APIContext, 'params' | 'request' | 'cookies'>;

/** Raised deliberately so the route can render a controlled 500 without a mode fallback. */
export class UnknownPostDetailModeError extends Error {
	constructor(
		readonly mode: string,
		readonly postId: string
	) {
		super(`Unsupported post detail mode: ${mode}`);
		this.name = 'UnknownPostDetailModeError';
	}
}

/** 详情路由将已删除内容转换为无身份信息的 410 响应。 */
export class PostDetailGoneError extends Error {
	readonly response = createGoneResponse();

	constructor() {
		super('Post detail is permanently unavailable');
		this.name = 'PostDetailGoneError';
	}
}

/** 禁用账号的内容不再作为公开入口提供，且不暴露作者身份。 */
export class PostDetailNoindexNotFoundError extends Error {
	readonly response = createNoindexNotFoundResponse();

	constructor() {
		super('Post detail author is disabled');
		this.name = 'PostDetailNoindexNotFoundError';
	}
}

export const getAsideExcerpt = (content: string, length: number) =>
	content.replace(/[#*`>\-[\]()!]/g, '').slice(0, length);

export async function loadPostDetail(context: PostDetailContext) {
	// 路由参数
	const { username, postId } = context.params;
	if (!username || !postId) return null;
	const resolvedUsername = await resolveUsername(username);
	if (!resolvedUsername) return null;

	// 查询帖子
	const post = await prisma.post.findUnique({
		where: { id: postId },
		include: {
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true,
					bio: true,
					deletedAt: true,
					isDisabled: true,
					_count: {
						select: {
							posts: { where: { isDeleted: false } },
							followers: true,
							following: true
						}
					}
				}
			},
			media: {
				orderBy: { sortOrder: 'asc' },
				include: {
					fileStorage: {
						select: {
							id: true,
							filePath: true,
							fileSize: true,
							mimeType: true,
							fileType: true
						}
					}
				}
			},
			tags: {
				include: {
					tag: {
						select: {
							id: true,
							name: true
						}
					}
				}
			},
			mentions: {
				include: {
					user: {
						select: {
							id: true,
							username: true,
							displayName: true
						}
					}
				}
			},
			category: {
				select: {
					id: true,
					name: true,
					slug: true,
					mode: true,
					icon: true
				}
			}
		}
	});

	// 帖子不存在或用户名不匹配则 404
	if (!post || post.user.username !== resolvedUsername.username) {
		return null;
	}
	if (post.user.deletedAt || post.isDeleted) throw new PostDetailGoneError();
	if (post.user.isDisabled) throw new PostDetailNoindexNotFoundError();

	// 获取当前登录用户
	const currentUser = await getUserFromRequest(context);

	// 判断是否是帖子作者
	const isAuthor = currentUser?.userId === post.userId;

	// 可见度检查
	// 查询当前用户是否是帖子作者的粉丝
	let isFollower = false;
	if (currentUser && !isAuthor) {
		const followRecord = await prisma.follow.findUnique({
			where: {
				followerId_followingId: {
					followerId: currentUser.userId,
					followingId: post.userId
				}
			}
		});
		isFollower = !!followRecord;
	}

	// 查询帖子作者是否关注了当前用户
	let isFollowing = false;
	if (currentUser && !isAuthor) {
		const followRecord = await prisma.follow.findUnique({
			where: {
				followerId_followingId: {
					followerId: post.userId,
					followingId: currentUser.userId
				}
			}
		});
		isFollowing = !!followRecord;
	}

	// 检查帖子可见度（密码保护帖子在服务端不做密码验证，由前端处理）
	const isVisible = await checkPostVisibility(
		{
			visibility: post.visibility,
			userId: post.userId,
			passwordHash: post.passwordHash,
			allowedUserIds: post.allowedUserIds
		},
		currentUser ? { userId: currentUser.userId } : null,
		{ isFollower, isFollowing }
	);

	// 不可见且非密码保护帖子，返回 404
	// 密码保护帖子需要前端交互，不在此处拦截
	const isPasswordProtected = post.visibility === 'password';
	if (!isVisible && !isPasswordProtected) {
		return null;
	}

	// 密码保护帖子且非作者，标记为需要密码验证
	const needPassword = isPasswordProtected && !isAuthor;

	// 已删除帖子的处理
	const isDeleted = post.isDeleted;
	const isLocked = post.isLocked;

	// 是否可以置顶（作者且置顶功能开启）
	const canPin = isAuthor && MAX_USER_PINNED_POSTS > 0;

	// 分离图片和附件
	const thumbnail = post.media.find((m) => m.slot === 'thumbnail') || null;
	const images = post.media.filter((m) => m.fileType === 'image' && m.slot === null);
	const attachments = post.media.filter((m) => m.fileType === 'attachment' && m.slot === null);
	const hasImages = images.length > 0;
	const hasAttachments = attachments.length > 0;
	const isWeiboPost = post.mode === 'weibo';

	// 提取标签列表
	const postTags = post.tags.map((pt) => pt.tag);
	const hasTags = postTags.length > 0;

	// 提取提及用户列表
	const mentionedUsers = post.mentions.map((m) => m.user);
	const hasMentions = mentionedUsers.length > 0;

	// 查询点赞数和点赞用户列表（朋友圈风格展示）
	const likeRecords = await prisma.like.findMany({
		where: { postId: post.id },
		include: {
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true,
					deletedAt: true
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});
	const likeCount = likeRecords.length;
	// 点赞用户列表（用于朋友圈风格展示）
	const likeUsers = likeRecords.map((r) => r.user);

	// 查询当前用户是否已点赞
	let liked = false;
	if (currentUser) {
		liked = likeRecords.some((r) => r.userId === currentUser.userId);
	}

	// 查询收藏数和当前用户是否已收藏
	const bookmarkCount = await prisma.bookmark.count({
		where: { postId: post.id }
	});
	let bookmarked = false;
	if (currentUser) {
		const bookmarkRecord = await prisma.bookmark.findUnique({
			where: {
				userId_postId: {
					userId: currentUser.userId,
					postId: post.id
				}
			}
		});
		bookmarked = !!bookmarkRecord;
	}

	// 评论默认倒序；登录用户可用其已保存的偏好覆盖默认值。
	let commentSortOrder: 'asc' | 'desc' = 'desc';
	if (currentUser) {
		const settings = await prisma.userSettings.findUnique({
			where: { userId: currentUser.userId }
		});
		if (settings?.commentSortOrder === 'asc') {
			commentSortOrder = 'asc';
		}
	}

	// 查询评论列表（一级评论 + 嵌套二级评论）
	const comments = await prisma.comment.findMany({
		where: {
			postId: post.id,
			parentId: null
		},
		orderBy: { createdAt: commentSortOrder },
		include: {
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true,
					deletedAt: true
				}
			},
			replies: {
				orderBy: { createdAt: 'asc' },
				include: {
					user: {
						select: {
							id: true,
							username: true,
							displayName: true,
							avatarUrl: true,
							deletedAt: true
						}
					},
					likes: true
				}
			},
			likes: true
		}
	});

	// 当前用户 ID，用于判断点赞状态
	const currentUserId = currentUser?.userId;

	// 序列化评论数据，附加点赞信息
	const serializedComments = comments.map((comment) => {
		const likeCount = comment.likes.length;
		const commentLiked = currentUserId
			? comment.likes.some((l) => l.userId === currentUserId)
			: false;

		const replies = comment.replies.map((reply) => ({
			id: reply.id,
			postId: reply.postId,
			userId: reply.userId,
			parentId: reply.parentId,
			content: reply.isDeleted ? '该内容已删除' : reply.content,
			isDeleted: reply.isDeleted,
			createdAt: reply.createdAt.toISOString(),
			updatedAt: reply.updatedAt.toISOString(),
			user: reply.user.deletedAt
				? {
						id: 'deleted-user',
						username: 'deleted-user',
						displayName: '已注销用户',
						avatarUrl: '',
						isDeleted: true
					}
				: reply.user,
			likeCount: reply.likes.length,
			liked: currentUserId ? reply.likes.some((l) => l.userId === currentUserId) : false
		}));

		return {
			id: comment.id,
			postId: comment.postId,
			userId: comment.userId,
			parentId: comment.parentId,
			content: comment.isDeleted ? '该内容已删除' : comment.content,
			isDeleted: comment.isDeleted,
			createdAt: comment.createdAt.toISOString(),
			updatedAt: comment.updatedAt.toISOString(),
			user: comment.user.deletedAt
				? {
						id: 'deleted-user',
						username: 'deleted-user',
						displayName: '已注销用户',
						avatarUrl: '',
						isDeleted: true
					}
				: comment.user,
			likeCount,
			liked: commentLiked,
			replies
		};
	});

	// 评论总数（一级 + 二级）
	const commentCount = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);

	// 当前用户信息（传给 React 组件）
	const currentUserForComponent = currentUser
		? { userId: currentUser.userId, username: currentUser.username }
		: null;

	// ===== SEO 元数据 =====
	// 帖子模式相关变量
	if (!POST_DETAIL_MODES.includes(post.mode as PostDetailMode)) {
		console.error(
			JSON.stringify({ event: 'unknown_post_detail_mode', postId: post.id, mode: post.mode })
		);
		throw new UnknownPostDetailModeError(post.mode, post.id);
	}
	const postMode = post.mode as PostDetailMode;
	const isWeibo = postMode === 'weibo';
	const isForum = postMode === 'forum';
	const isBlog = postMode === 'blog';
	// 右侧信息只使用可见的真实记录：博客显示同主题文章，论坛显示同类版块，
	// 微博则显示作者的其他动态。这样详情页不需要等待客户端推荐接口才完整。
	const relatedPosts = isForum
		? []
		: await prisma.post.findMany({
				where: isWeibo
					? {
							id: { not: post.id },
							userId: post.userId,
							mode: 'weibo',
							isDeleted: false,
							visibility: 'public',
							user: { deletedAt: null }
						}
					: {
							id: { not: post.id },
							mode: 'blog',
							isDeleted: false,
							visibility: 'public',
							user: { deletedAt: null },
							...(post.categoryId ? { categoryId: post.categoryId } : {})
						},
				orderBy: { createdAt: 'desc' },
				take: 5,
				select: {
					id: true,
					title: true,
					content: true,
					createdAt: true,
					user: { select: { username: true, displayName: true } }
				}
			});
	const relatedForums = isForum
		? await prisma.category.findMany({
				where: {
					mode: 'forum',
					...(post.categoryId ? { id: { not: post.categoryId } } : {})
				},
				orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
				take: 5,
				select: { name: true, slug: true, description: true, icon: true }
			})
		: [];

	// 博客文章导航只链接作者公开、未删除的其他博客，避免在公开详情中暴露不可访问文章。
	const [previousBlog, nextBlog] = isBlog
		? await Promise.all([
				prisma.post.findFirst({
					where: {
						userId: post.userId,
						mode: 'blog',
						isDeleted: false,
						visibility: 'public',
						user: { deletedAt: null },
						OR: [
							{ createdAt: { lt: post.createdAt } },
							{ createdAt: post.createdAt, id: { lt: post.id } }
						]
					},
					orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
					select: { id: true, title: true, content: true }
				}),
				prisma.post.findFirst({
					where: {
						userId: post.userId,
						mode: 'blog',
						isDeleted: false,
						visibility: 'public',
						user: { deletedAt: null },
						OR: [
							{ createdAt: { gt: post.createdAt } },
							{ createdAt: post.createdAt, id: { gt: post.id } }
						]
					},
					orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
					select: { id: true, title: true, content: true }
				})
			])
		: [null, null];
	const blogCategoryLabel = post.customCategory ?? post.category?.name ?? getModeLabel('blog');

	// 渲染内容：forum/blog 模式使用 renderFullMarkdown（支持图片），weibo 使用受限版
	const htmlContent = isDeleted
		? '<p>该内容已删除</p>'
		: isForum || isBlog
			? renderFullMarkdown(post.content)
			: renderMarkdown(post.content);
	// 博客的目录锚点由服务端在已净化的 HTML 上补齐，避免在客户端重写正文。
	const blogHeadings: Array<{ id: string; text: string; level: number }> = [];
	let blogHeadingIndex = 0;
	const detailHtmlContent = isBlog
		? htmlContent.replace(
				/<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/g,
				(_match, level, attributes, content) => {
					const id = `article-section-${blogHeadingIndex + 1}`;
					blogHeadingIndex += 1;
					const text = content.replace(/<[^>]+>/g, '').trim();
					if (text) blogHeadings.push({ id, text, level: Number(level) });
					const attributesWithoutId = attributes.replace(/\s+id=("[^"]*"|'[^']*')/i, '');
					return `<h${level}${attributesWithoutId} id="${id}">${content}</h${level}>`;
				}
			)
		: htmlContent;
	const hasBlogHeadings = blogHeadings.length > 0;
	const visibilityLabel =
		post.visibility === 'public'
			? '公开可见'
			: post.visibility === 'logged_in'
				? '登录用户可见'
				: post.visibility === 'followers'
					? '粉丝可见'
					: post.visibility === 'following'
						? '我关注的人可见'
						: post.visibility === 'password'
							? '密码保护'
							: '仅自己可见';
	const hasTitle = !!post.title;

	// 页面标题：根据模式不同显示不同格式
	const isNotPublic = post.visibility !== 'public' || isDeleted;
	const seoTitle = isNotPublic
		? '非公开内容'
		: isForum || isBlog
			? post.title || `${post.user.displayName}的帖子`
			: `${post.user.displayName}的${getModeLabel('weibo')}`;

	// 页面描述：帖子内容前 100 字符，去除 Markdown 标记
	const seoDescription = isNotPublic
		? '此内容仅限授权访问。'
		: post.content.replace(/[#*`>\-[\]()!]/g, '').slice(0, 100);

	// 规范链接
	const canonicalUrl = getCanonicalUrl(`/${post.user.username}/${post.id}`);

	// OG 图片：取帖子第一张图片，无图片时不设置
	const ogImageUrl =
		!isNotPublic && hasImages
			? `${SITE_URL}/uploads/${images[0].fileStorage.filePath}`
			: undefined;

	return {
		redirectUsername: resolvedUsername.isLegacy ? post.user.username : null,
		post,
		currentUser,
		isAuthor,
		isFollower,
		needPassword,
		isDeleted,
		isLocked,
		canPin,
		images,
		thumbnail,
		attachments,
		hasImages,
		hasAttachments,
		isWeiboPost,
		postTags,
		hasTags,
		mentionedUsers,
		hasMentions,
		likeCount,
		likeUsers,
		liked,
		bookmarkCount,
		bookmarked,
		commentSortOrder,
		serializedComments,
		commentCount,
		currentUserForComponent,
		postMode,
		isWeibo,
		isForum,
		isBlog,
		relatedPosts,
		relatedForums,
		previousBlog,
		nextBlog,
		blogCategoryLabel,
		detailHtmlContent,
		blogHeadings,
		hasBlogHeadings,
		visibilityLabel,
		hasTitle,
		seoTitle,
		seoDescription,
		canonicalUrl,
		isNotPublic,
		ogImageUrl
	};
}

export type PostDetailModel = NonNullable<Awaited<ReturnType<typeof loadPostDetail>>>;

/** Keep canonical article metadata identical across the three internal views. */

export function getPostDetailJsonLd(model: PostDetailModel): Record<string, unknown> | undefined {
	if (model.isNotPublic) return undefined;
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: model.seoTitle,
		description: model.seoDescription,
		url: model.canonicalUrl,
		image: model.ogImageUrl,
		author: {
			'@type': 'Person',
			name: model.post.user.displayName,
			url: model.canonicalUrl.replace(`/${model.post.id}`, '')
		},
		datePublished: model.post.createdAt.toISOString(),
		dateModified: model.post.updatedAt.toISOString(),
		publisher: { '@type': 'Organization', name: SITE_TITLE, url: SITE_URL }
	};
}
