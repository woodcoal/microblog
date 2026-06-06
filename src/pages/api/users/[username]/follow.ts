/**
 * 关注 API
 *
 * PUT /api/users/:username/follow — 切换关注状态
 * 已关注则取关，未关注则关注。
 * 需要登录认证，不能关注自己。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, FOLLOW_CREATE, FOLLOW_REMOVE } from '@/lib/activity';

/**
 * 切换关注状态
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 检查目标用户存在
 * 3. 不能关注自己
 * 4. 查询是否已关注，切换状态
 * 5. 返回当前关注状态和粉丝数
 *
 * @param context - Astro API 上下文
 * @returns { following: boolean, followerCount: number } 或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { username } = context.params;
		if (!username) {
			return jsonErrorResponse('用户名不能为空');
		}

		// 2. 检查目标用户存在
		const targetUser = await prisma.user.findUnique({
			where: { username },
			select: { id: true }
		});
		if (!targetUser) {
			return jsonErrorResponse('用户不存在', 404);
		}

		// 3. 不能关注自己
		if (targetUser.id === currentUser.userId) {
			return jsonErrorResponse('不能关注自己', 400);
		}

		// 4. 查询当前关注状态（仅用于确定操作意图）
		const existingFollow = await prisma.follow.findUnique({
			where: {
				followerId_followingId: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			}
		});

		let following: boolean;
		if (existingFollow) {
			// 已关注 → 取关：直接 delete 并 catch P2025（记录不存在），避免竞态
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
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			following = false;
			// 记录取关活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_REMOVE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		} else {
			// 未关注 → 关注：使用 upsert 避免竞态，已存在则忽略
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
			following = true;

			// 发送关注通知（异步，不阻塞主流程）
			createNotification('follow', currentUser.userId, targetUser.id).catch(() => {});
			// 记录关注活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_CREATE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		}

		// 5. 统计目标用户粉丝数
		const followerCount = await prisma.follow.count({
			where: { followingId: targetUser.id }
		});

		return new Response(JSON.stringify(successResponse({ following, followerCount })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('切换关注失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
