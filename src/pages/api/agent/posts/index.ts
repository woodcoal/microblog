/**
 * Agent 帖子 API
 *
 * GET  /api/agent/posts — 帖子列表（多过滤、可见度过滤、hot排序）
 * POST /api/agent/posts — 发帖
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import {
	requireAgentAuth,
	textResponse,
	textErrorResponse,
	parsePagination,
	getFollowIds,
	formatPostListItem
} from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { generateShortId } from '@/lib/shortid';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { MAX_IMAGE_COUNT } from '@/lib/upload';
import { parseMentions, parseTags } from '@/lib/parser';
import { getVisibilityFilter, VALID_VISIBILITIES, type Visibility } from '@/lib/visibility';
import { createNotification } from '@/lib/notification';
import { logActivity, POST_CREATE } from '@/lib/activity';
import { calculateTrendingScore } from '@/lib/trending';

/** Agent API 不支持的可见度类型 */
const AGENT_UNSUPPORTED_VISIBILITIES: Visibility[] = ['password', 'users'];

/** hot 排序时最大查询数量 */
const HOT_SORT_MAX = 200;

// ═══════════════════════════════════════════════════════════════════════════
// GET — 帖子列表
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 获取帖子列表
 *
 * 参数：keyword, tag, from, to, user, userScope, sort, page, limit
 * 支持可见度过滤和 hot 排序。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的帖子列表
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const url = new URL(context.request.url);
		const keyword = url.searchParams.get('keyword')?.trim() || undefined;
		const tag = url.searchParams.get('tag')?.trim() || undefined;
		const fromStr = url.searchParams.get('from');
		const toStr = url.searchParams.get('to');
		const targetUsername = url.searchParams.get('user')?.trim() || undefined;
		const userScope = url.searchParams.get('userScope') || 'all';
		const sort = url.searchParams.get('sort') || 'latest';
		const { limit, skip } = parsePagination(url);

		// 时间范围解析
		let from: Date | undefined;
		let to: Date | undefined;
		if (fromStr) {
			from = new Date(fromStr);
			if (isNaN(from.getTime())) return textErrorResponse('起始时间格式无效');
		}
		if (toStr) {
			to = new Date(toStr);
			if (isNaN(to.getTime())) return textErrorResponse('结束时间格式无效');
		}

		// 获取关注关系
		const { followingIds, followerIds } = await getFollowIds(currentUser.userId);

		// 可见度过滤基础条件
		const visibilityFilter = getVisibilityFilter(currentUser, { followingIds, followerIds });

		// 构建 where 条件
		const where: Record<string, unknown> = {
			isDeleted: false,
			...visibilityFilter
		};

		// keyword 过滤
		if (keyword) {
			where.content = { contains: keyword };
		}

		// 时间范围过滤
		if (from || to) {
			const createdAtFilter: Record<string, Date> = {};
			if (from) createdAtFilter.gte = from;
			if (to) createdAtFilter.lte = to;
			where.createdAt = createdAtFilter;
		}

		// tag 过滤
		if (tag) {
			const tagRecord = await prisma.tag.findUnique({
				where: { name: tag },
				select: { id: true }
			});
			if (!tagRecord) {
				// 标签不存在，返回空列表
				return textResponse('');
			}
			const postTags = await prisma.postTag.findMany({
				where: { tagId: tagRecord.id },
				select: { postId: true }
			});
			const postIdsByTag = postTags.map((pt) => pt.postId);
			if (postIdsByTag.length === 0) {
				return textResponse('');
			}
			where.id = { in: postIdsByTag };
		}

		// user 过滤
		if (targetUsername) {
			const targetUser = await prisma.user.findUnique({
				where: { username: targetUsername },
				select: { id: true }
			});
			if (!targetUser) {
				return textResponse('');
			}
			where.userId = targetUser.id;
		} else if (userScope === 'following') {
			// 当前用户关注的人发的帖子（含自己）
			where.userId = { in: [...followingIds, currentUser.userId] };
		} else if (userScope === 'followers') {
			// 关注当前用户的粉丝发的帖子（含自己）
			where.userId = { in: [...followerIds, currentUser.userId] };
		}

		// 查询帖子
		let posts: Array<{
			id: string;
			content: string;
			createdAt: Date;
			_count?: { likes: number; comments: number };
		}>;

		if (sort === 'hot') {
			// hot 排序：查询满足条件的帖子，内存排序
			// 限制查询数量避免全表加载
			const hotPosts = await prisma.post.findMany({
				where,
				take: HOT_SORT_MAX,
				select: {
					id: true,
					content: true,
					createdAt: true,
					_count: { select: { likes: true, comments: true } }
				}
			});

			// 计算热门分数并排序
			const scored = hotPosts
				.map((p) => ({
					...p,
					score: calculateTrendingScore(
						p._count?.likes ?? 0,
						p._count?.comments ?? 0,
						p.createdAt
					)
				}))
				.sort((a, b) => b.score - a.score);

			// 分页截取
			posts = scored.slice(skip, skip + limit);
		} else {
			// latest/earliest 排序
			const orderBy =
				sort === 'earliest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

			posts = await prisma.post.findMany({
				where,
				orderBy,
				skip,
				take: limit,
				select: { id: true, content: true, createdAt: true }
			});
		}

		// 格式化输出
		const lines = posts.map((p) => formatPostListItem(p));
		return textResponse(lines.join('\n'));
	} catch (error) {
		console.error('获取帖子列表失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};

// ═══════════════════════════════════════════════════════════════════════════
// POST — 发帖
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建新帖子
 *
 * 参数：content（内容）、images（图片 URL 数组）、visibility（可见度）
 * Agent API 不支持 password/users 可见度。
 *
 * @param context - Astro API 上下文
 * @returns `ok: postid` 或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		let { content, images, visibility } = body as {
			content?: string;
			images?: string[];
			visibility?: string;
		};

		// 验证内容
		if (!content?.trim()) {
			return textErrorResponse('帖子内容不能为空');
		}
		if (content.length > POST_CONTENT_MAX_LENGTH) {
			return textErrorResponse(`内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
		}

		// 验证并规范化可见度
		const vis = (visibility || 'public') as Visibility;
		if (!VALID_VISIBILITIES.includes(vis)) {
			return textErrorResponse('无效的可见度类型');
		}
		if (AGENT_UNSUPPORTED_VISIBILITIES.includes(vis)) {
			return textErrorResponse('Agent API 不支持 password/users 可见度');
		}

		// 处理 images URL 数组 -> FileStorage ID 数组
		let mediaIds: string[] = [];
		if (images && images.length > 0) {
			// 去重
			images = [...new Set(images)];

			// 验证图片数量
			if (images.length > MAX_IMAGE_COUNT) {
				return textErrorResponse(`图片最多 ${MAX_IMAGE_COUNT} 张`);
			}

			// 从 URL 解析 filePath，查询 FileStorage
			const filePaths = images.map((url) => {
				// 去掉 /uploads/ 前缀
				if (url.startsWith('/uploads/')) {
					return url.slice(9); // '/uploads/'.length = 9
				}
				return url;
			});

			const fileStorages = await prisma.fileStorage.findMany({
				where: { filePath: { in: filePaths } },
				select: { id: true, fileType: true }
			});

			// 验证所有 URL 都存在对应的 FileStorage
			if (fileStorages.length !== filePaths.length) {
				return textErrorResponse('部分图片不存在');
			}

			// 验证都是图片类型
			const imageCount = fileStorages.filter((f) => f.fileType === 'image').length;
			if (imageCount !== fileStorages.length) {
				return textErrorResponse('仅支持图片类型的文件');
			}

			mediaIds = fileStorages.map((f) => f.id);
		}

		// 生成 8 位短链 ID
		const id = generateShortId();

		// 使用事务包裹创建帖子涉及的多个写操作
		const post = await prisma.$transaction(async (tx) => {
			const createdPost = await tx.post.create({
				data: {
					id,
					userId: currentUser.userId,
					content: content.trim(),
					visibility: vis
				}
			});

			// 创建 Media 关联记录
			if (mediaIds.length > 0) {
				await tx.media.createMany({
					data: mediaIds.map((fileStorageId, index) => ({
						postId: createdPost.id,
						fileStorageId,
						fileType: 'image',
						originalName: '',
						sortOrder: index
					}))
				});
			}

			// 解析 @提及
			const mentionUsernames = parseMentions(content.trim());
			if (mentionUsernames.length > 0) {
				const mentionedUsers = await tx.user.findMany({
					where: {
						username: { in: mentionUsernames },
						id: { not: currentUser.userId }
					},
					select: { id: true }
				});
				if (mentionedUsers.length > 0) {
					await tx.mention.createMany({
						data: mentionedUsers.map((u) => ({
							postId: createdPost.id,
							userId: u.id
						}))
					});
				}
			}

			// 解析 #标签
			const tagNames = parseTags(content.trim());
			if (tagNames.length > 0) {
				for (const name of tagNames) {
					const tag = await tx.tag.upsert({
						where: { name },
						update: {},
						create: { name }
					});
					await tx.postTag.create({
						data: { postId: createdPost.id, tagId: tag.id }
					});
				}
			}

			return createdPost;
		});

		// 异步发送 @提及通知
		const mentionUsernames = parseMentions(content.trim());
		if (mentionUsernames.length > 0) {
			const mentionedUsers = await prisma.user.findMany({
				where: {
					username: { in: mentionUsernames },
					id: { not: currentUser.userId }
				},
				select: { id: true }
			});
			for (const u of mentionedUsers) {
				createNotification('mention', currentUser.userId, u.id, post.id).catch(() => {});
			}
		}

		// 异步记录活动日志
		logActivity(POST_CREATE, currentUser.userId, 'post', post.id, currentUser.userId, post.id).catch(() => {});

		return textResponse(`ok: ${post.id}`, 201);
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('创建帖子失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
