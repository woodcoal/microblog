/**
 * Agent 帖子详情 API
 *
 * GET /api/agent/posts/:id — 获取帖子详情（含评论和媒体）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse, formatPostDetail } from '@/lib/agent';
import { checkPostVisibility } from '@/lib/visibility';

/**
 * 获取帖子详情
 *
 * 参数：comments（0=全部, -1=不返回, >0=数量限制）
 * 评论按时间倒序，回复紧跟父评论按时间倒序。
 * 遵守可见度规则：password 帖子返回提示，users 帖子无权返回提示。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的帖子详情
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return textErrorResponse('帖子标识不能为空');
		}

		// 解析 comments 参数
		const url = new URL(context.request.url);
		const commentsParam = Number(url.searchParams.get('comments')) || 0;

		// 查询帖子
		const post = await prisma.post.findUnique({
			where: { id },
			include: {
				user: {
					select: { username: true, displayName: true }
				},
				media: {
					orderBy: { sortOrder: 'asc' },
					include: {
						fileStorage: {
							select: { filePath: true, fileType: true }
						}
					}
				}
			}
		});

		if (!post) {
			return textErrorResponse('帖子不存在', 404);
		}

		if (post.isDeleted) {
			return textErrorResponse('该内容已删除');
		}

		// 可见度检查：查询 isFollower/isFollowing
		let isFollower = false;
		let isFollowing = false;
		if (currentUser.userId !== post.userId) {
			const followRecord = await prisma.follow.findUnique({
				where: {
					followerId_followingId: {
						followerId: currentUser.userId,
						followingId: post.userId
					}
				}
			});
			isFollower = !!followRecord;

			const reverseFollowRecord = await prisma.follow.findUnique({
				where: {
					followerId_followingId: {
						followerId: post.userId,
						followingId: currentUser.userId
					}
				}
			});
			isFollowing = !!reverseFollowRecord;
		}

		const visible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			{ userId: currentUser.userId },
			{ isFollower, isFollowing }
		);

		if (!visible) {
			// password 帖子：Agent 无法输入密码
			if (post.visibility === 'password') {
				return textErrorResponse('该帖子需要密码访问', 403);
			}
			// users 帖子：当前用户不在列表中
			if (post.visibility === 'users') {
				return textErrorResponse('无权查看该帖子', 403);
			}
			return textErrorResponse('帖子不存在', 404);
		}

		// 查询评论（按 comments 参数决定是否返回及数量）
		let comments: Parameters<typeof formatPostDetail>[1] = [];

		if (commentsParam !== -1) {
			// 查询一级评论
			const takeCount = commentsParam > 0 ? commentsParam : undefined;

			const rawComments = await prisma.comment.findMany({
				where: {
					postId: id,
					parentId: null,
					isDeleted: false
				},
				orderBy: { createdAt: 'desc' },
				...(takeCount && { take: takeCount }),
				include: {
					user: {
						select: { username: true, displayName: true }
					},
					replies: {
						where: { isDeleted: false },
						orderBy: { createdAt: 'desc' },
						include: {
							user: {
								select: { username: true, displayName: true }
							}
						}
					}
				}
			});

			// 映射为 formatPostDetail 期望的类型
			comments = rawComments.map((c) => ({
				id: c.id,
				content: c.content,
				createdAt: c.createdAt,
				isDeleted: c.isDeleted,
				user: c.user,
				replies: c.replies.map((r) => ({
					id: r.id,
					content: r.content,
					parentId: r.parentId ?? '',
					createdAt: r.createdAt,
					isDeleted: r.isDeleted,
					user: r.user
				}))
			}));
		}

		return textResponse(formatPostDetail(post, comments));
	} catch (error) {
		console.error('获取帖子详情失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
