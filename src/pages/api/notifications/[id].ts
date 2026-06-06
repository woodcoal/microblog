/**
 * 删除通知 API
 *
 * DELETE /api/notifications/[id] — 删除指定通知
 * 只能删除自己收到的通知（recipientId 必须匹配当前用户）。
 * 需要登录认证。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 删除单条通知
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询通知是否存在且属于当前用户
 * 3. 删除通知
 * 4. 返回成功
 *
 * @param context - Astro API 上下文
 * @returns 成功或错误响应
 */
export const DELETE: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 获取通知 ID
		const id = context.params.id;
		if (!id) {
			return jsonErrorResponse('缺少通知 ID');
		}

		// 3. 查询通知，确认属于当前用户
		const notification = await prisma.notification.findUnique({
			where: { id },
			select: { recipientId: true }
		});

		if (!notification) {
			return jsonErrorResponse('通知不存在', 404);
		}

		if (notification.recipientId !== currentUser.userId) {
			return jsonErrorResponse('无权删除此通知', 403);
		}

		// 4. 删除通知
		await prisma.notification.delete({
			where: { id }
		});

		return new Response(JSON.stringify(successResponse({ deleted: true })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除通知失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
