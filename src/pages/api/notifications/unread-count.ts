/**
 * 未读通知数量 API
 *
 * GET /api/notifications/unread-count — 获取当前用户的未读通知数量
 * 若用户关闭了通知，返回 0。
 * 需要登录认证。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getUnreadCount } from '@/lib/notification';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取未读通知数量
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 检查用户通知开关，关闭则返回 0
 * 3. 查询未读通知数量
 * 4. 返回数量
 *
 * @param context - Astro API 上下文
 * @returns { count: number } 或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 检查通知开关
		const settings = await prisma.userSettings.findUnique({
			where: { userId: currentUser.userId },
			select: { notificationsEnabled: true }
		});
		if (settings && !settings.notificationsEnabled) {
			return new Response(JSON.stringify(successResponse({ count: 0 })), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// 3. 查询未读数量
		const count = await getUnreadCount(currentUser.userId);

		return new Response(JSON.stringify(successResponse({ count })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取未读数量失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
