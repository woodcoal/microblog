/**
 * 帖子评论 API
 *
 * GET  /api/posts/:id/comments — 获取评论列表
 * POST /api/posts/:id/comments — 发表评论
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { getUserFromRequest, requireAuth } from '@/lib/auth';
import { successResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, COMMENT_CREATE } from '@/lib/activity';

/** 评论内容最大长度 */
const COMMENT_MAX_LENGTH = 1000;

/**
 * 获取帖子评论列表
 *
 * 流程：
 * 1. 验证帖子存在
 * 2. 确定排序方式（URL 参数 > 用户偏好 > 默认正序）
 * 3. 查询所有一级评论及其嵌套回复
 * 4. 为每条评论附加点赞数和当前用户点赞状态
 * 5. 已删除评论保留结构但替换内容
 *
 * @param context - Astro API 上下文
 * @returns 评论列表或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 1. 验证帖子存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 2. 确定排序方式
		const currentUser = await getUserFromRequest(context);
		const urlSort = context.url.searchParams.get('sort') as string | null;

		let sortOrder: 'asc' | 'desc' = 'asc';
		if (urlSort === 'asc' || urlSort === 'desc') {
			sortOrder = urlSort;
		} else if (currentUser) {
			// 未指定排序参数时，读取用户偏好
			const settings = await prisma.userSettings.findUnique({
				where: { userId: currentUser.userId }
			});
			if (settings?.commentSortOrder === 'desc') {
				sortOrder = 'desc';
			}
		}

		// 3. 查询所有一级评论及其嵌套回复
		const comments = await prisma.comment.findMany({
			where: {
				postId: id,
				parentId: null
			},
			orderBy: { createdAt: sortOrder },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
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
								avatarUrl: true
							}
						},
						likes: true
					}
				},
				likes: true
			}
		});

		// 4. 附加点赞信息
		const currentUserId = currentUser?.userId;
		const enrichComment = (comment: (typeof comments)[number]) => {
			const likeCount = comment.likes.length;
			const liked = currentUserId
				? comment.likes.some((l) => l.userId === currentUserId)
				: false;
			const isDeleted = comment.isDeleted;

			// 处理子评论
			const replies = comment.replies.map((reply) => {
				const replyLikeCount = reply.likes.length;
				const replyLiked = currentUserId
					? reply.likes.some((l) => l.userId === currentUserId)
					: false;
				return {
					id: reply.id,
					postId: reply.postId,
					userId: reply.userId,
					parentId: reply.parentId,
					content: reply.isDeleted ? '该内容已删除' : reply.content,
					isDeleted: reply.isDeleted,
					createdAt: reply.createdAt.toISOString(),
					updatedAt: reply.updatedAt.toISOString(),
					user: reply.user,
					likeCount: replyLikeCount,
					liked: replyLiked
				};
			});

			return {
				id: comment.id,
				postId: comment.postId,
				userId: comment.userId,
				parentId: comment.parentId,
				content: isDeleted ? '该内容已删除' : comment.content,
				isDeleted,
				createdAt: comment.createdAt.toISOString(),
				updatedAt: comment.updatedAt.toISOString(),
				user: comment.user,
				likeCount,
				liked,
				replies
			};
		};

		const enrichedComments = comments.map(enrichComment);

		return new Response(
			JSON.stringify(successResponse({ items: enrichedComments, sortOrder })),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取评论列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 发表评论
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证帖子存在、未删除、未锁定
 * 3. 校验内容非空且不超过最大长度
 * 4. 如果是二级评论，验证 parentId 属于同一帖子
 * 5. 创建评论记录
 * 6. 返回评论数据（含用户信息）
 *
 * @param context - Astro API 上下文
 * @returns 评论数据或错误
 */
export const POST: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 2. 验证帖子存在、未删除、未锁定
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已删除，无法评论', 400);
		}
		if (post.isLocked) {
			return jsonErrorResponse('帖子已锁定，无法评论', 403);
		}

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { content, parentId } = body as { content?: string; parentId?: string };

		// 3. 校验内容
		if (!content || !content.trim()) {
			return jsonErrorResponse('评论内容不能为空');
		}
		if (content.length > COMMENT_MAX_LENGTH) {
			return jsonErrorResponse(`评论不能超过 ${COMMENT_MAX_LENGTH} 个字符`);
		}

		// 4. 验证 parentId 属于同一帖子
		if (parentId) {
			const parentComment = await prisma.comment.findUnique({
				where: { id: parentId }
			});
			if (!parentComment) {
				return jsonErrorResponse('回复的评论不存在', 404);
			}
			if (parentComment.postId !== id) {
				return jsonErrorResponse('回复的评论不属于该帖子', 400);
			}
			// 不允许回复二级评论（只支持两级）
			if (parentComment.parentId) {
				return jsonErrorResponse('不支持多级嵌套回复', 400);
			}
		}

		// 5. 创建评论
		const comment = await prisma.comment.create({
			data: {
				postId: id,
				userId: currentUser.userId,
				parentId: parentId || null,
				content: content.trim()
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
					}
				}
			}
		});

		// 6. 返回评论数据
		// 发送评论通知（异步，不阻塞主流程）
		createNotification('comment', currentUser.userId, post.userId, id, comment.id).catch(
			() => {}
		);
		// 记录发表评论活动（异步，不阻塞主流程）
		logActivity(
			COMMENT_CREATE,
			currentUser.userId,
			'comment',
			comment.id,
			post.userId,
			id
		).catch(() => {});

		return new Response(
			JSON.stringify(
				successResponse({
					id: comment.id,
					postId: comment.postId,
					userId: comment.userId,
					parentId: comment.parentId,
					content: comment.content,
					isDeleted: comment.isDeleted,
					createdAt: comment.createdAt.toISOString(),
					updatedAt: comment.updatedAt.toISOString(),
					user: comment.user,
					likeCount: 0,
					liked: false
				})
			),
			{ status: 201, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('发表评论失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
