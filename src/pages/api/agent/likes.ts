/**
 * Agent 点赞 API
 *
 * POST /api/agent/likes — 点赞或取消点赞帖子（显式 action）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, LIKE_CREATE, LIKE_REMOVE } from '@/lib/activity';

/**
 * 点赞或取消点赞帖子
 *
 * 参数：postId（帖子标识）、action（like/unlike）
 * 幂等处理：重复 like 或取消不存在的点赞均返回 ok。
 *
 * @param context - Astro API 上下文
 * @returns `ok` 或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { postId, action } = body as { postId?: string; action?: string };

		// 参数校验
		if (!postId?.trim()) {
			return textErrorResponse('帖子标识不能为空');
		}
		if (action !== 'like' && action !== 'unlike') {
			return textErrorResponse('action 必须为 like 或 unlike');
		}

		// 检查帖子存在且未删除
		const post = await prisma.post.findUnique({ where: { id: postId.trim() } });
		if (!post) {
			return textErrorResponse('帖子不存在', 404);
		}
		if (post.isDeleted) {
			return textErrorResponse('帖子已删除');
		}

		if (action === 'like') {
			// upsert 避免竞态，已点赞时忽略（幂等）
			await prisma.like.upsert({
				where: {
					userId_postId: {
						userId: currentUser.userId,
						postId: post.id
					}
				},
				update: {},
				create: {
					userId: currentUser.userId,
					postId: post.id
				}
			});
			// 异步发送通知 + 记录活动
			createNotification('like', currentUser.userId, post.userId, post.id).catch(() => {});
			logActivity(
				LIKE_CREATE,
				currentUser.userId,
				'post',
				post.id,
				post.userId,
				post.id
			).catch(() => {});
		} else {
			// 取消点赞：delete 并 catch P2025（记录不存在），幂等处理
			try {
				await prisma.like.delete({
					where: {
						userId_postId: {
							userId: currentUser.userId,
							postId: post.id
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已取消，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			// 异步记录活动
			logActivity(
				LIKE_REMOVE,
				currentUser.userId,
				'post',
				post.id,
				post.userId,
				post.id
			).catch(() => {});
		}

		return textResponse('ok');
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('点赞操作失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
