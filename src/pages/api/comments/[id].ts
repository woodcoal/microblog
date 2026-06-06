/**
 * 评论操作 API
 *
 * DELETE /api/comments/:id — 软删除评论
 * PUT    /api/comments/:id/like — 切换评论点赞
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, COMMENT_DELETE, LIKE_CREATE, LIKE_REMOVE } from '@/lib/activity';

/**
 * 软删除评论
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证评论存在
 * 3. 验证是评论作者
 * 4. 标记 isDeleted = true
 *
 * @param context - Astro API 上下文
 * @returns 成功或错误
 */
export const DELETE: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('评论 ID 不能为空');
		}

		// 2. 验证评论存在
		const comment = await prisma.comment.findUnique({ where: { id } });
		if (!comment) {
			return jsonErrorResponse('评论不存在', 404);
		}

		// 3. 验证是评论作者
		if (comment.userId !== currentUser.userId) {
			return jsonErrorResponse('无权删除此评论', 403);
		}

		// 已删除的评论
		if (comment.isDeleted) {
			return jsonErrorResponse('评论已被删除', 400);
		}

		// 4. 软删除
		await prisma.comment.update({
			where: { id },
			data: { isDeleted: true }
		});

		// 记录删除评论活动（异步，不阻塞主流程）
		logActivity(
			COMMENT_DELETE,
			currentUser.userId,
			'comment',
			id,
			comment.userId,
			comment.postId
		).catch(() => {});

		return new Response(JSON.stringify(successResponse({ id })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除评论失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 切换评论点赞状态
 *
 * 流程与帖子点赞相同：
 * 1. 验证登录状态
 * 2. 验证评论存在
 * 3. 查询是否已点赞，切换状态
 * 4. 返回当前点赞状态和点赞数
 *
 * @param context - Astro API 上下文
 * @returns { liked: boolean, likeCount: number } 或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('评论 ID 不能为空');
		}

		// 2. 验证评论存在且未删除
		const comment = await prisma.comment.findUnique({ where: { id } });
		if (!comment || comment.isDeleted) {
			return jsonErrorResponse('评论不存在', 404);
		}

		// 3. 查询是否已点赞，切换状态
		const existingLike = await prisma.like.findUnique({
			where: {
				userId_commentId: {
					userId: currentUser.userId,
					commentId: id
				}
			}
		});

		let liked: boolean;
		if (existingLike) {
			// 已点赞 → 取消
			await prisma.like.delete({ where: { id: existingLike.id } });
			liked = false;
			// 记录取消评论点赞活动（异步，不阻塞主流程）
			logActivity(
				LIKE_REMOVE,
				currentUser.userId,
				'comment',
				id,
				comment.userId,
				comment.postId
			).catch(() => {});
		} else {
			// 未点赞 → 点赞
			await prisma.like.create({
				data: {
					userId: currentUser.userId,
					commentId: id
				}
			});
			liked = true;

			// 发送评论点赞通知（异步，不阻塞主流程）
			createNotification(
				'like',
				currentUser.userId,
				comment.userId,
				comment.postId,
				id
			).catch(() => {});
			// 记录评论点赞活动（异步，不阻塞主流程）
			logActivity(
				LIKE_CREATE,
				currentUser.userId,
				'comment',
				id,
				comment.userId,
				comment.postId
			).catch(() => {});
		}

		// 4. 统计当前点赞数
		const likeCount = await prisma.like.count({
			where: { commentId: id }
		});

		return new Response(JSON.stringify(successResponse({ liked, likeCount })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('切换评论点赞失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
