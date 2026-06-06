/**
 * Agent 关注 API
 *
 * POST /api/agent/follows — 关注或取消关注用户（显式 action）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, FOLLOW_CREATE, FOLLOW_REMOVE } from '@/lib/activity';

/**
 * 关注或取消关注用户
 *
 * 参数：username（目标用户名）、action（follow/unfollow）
 * 幂等处理：重复 follow 或取消不存在的关注均返回 ok。
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
		const { username, action } = body as { username?: string; action?: string };

		// 参数校验
		if (!username?.trim()) {
			return textErrorResponse('用户名不能为空');
		}
		if (action !== 'follow' && action !== 'unfollow') {
			return textErrorResponse('action 必须为 follow 或 unfollow');
		}

		// 检查目标用户存在
		const targetUser = await prisma.user.findUnique({
			where: { username: username.trim() },
			select: { id: true }
		});
		if (!targetUser) {
			return textErrorResponse('用户不存在', 404);
		}

		// 不能关注自己
		if (targetUser.id === currentUser.userId) {
			return textErrorResponse('不能关注自己');
		}

		if (action === 'follow') {
			// upsert 避免竞态，已关注时忽略（幂等）
			await prisma.follow.upsert({
				where: {
					followerId_followingId: {
						followerId: currentUser.userId,
						followingId: targetUser.id
					}
				},
				update: {},
				create: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			});
			// 异步发送通知 + 记录活动
			createNotification('follow', currentUser.userId, targetUser.id).catch(() => {});
			logActivity(
				FOLLOW_CREATE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		} else {
			// 取消关注：delete 并 catch P2025（记录不存在），幂等处理
			try {
				await prisma.follow.delete({
					where: {
						followerId_followingId: {
							followerId: currentUser.userId,
							followingId: targetUser.id
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已取关，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			// 异步记录活动
			logActivity(
				FOLLOW_REMOVE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		}

		return textResponse('ok');
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('关注操作失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
