/**
 * 标记已读 API
 *
 * PUT /api/notifications/read — 标记通知为已读
 * body 中 ids 为空时标记全部已读，否则标记指定 ID 的通知。
 * 需要登录认证。
 */
import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { markNotificationsRead } from '@/lib/notification';
import { successResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';

/**
 * 标记通知已读
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 解析请求体中的 ids 参数
 * 3. 调用 markNotificationsRead 标记已读
 * 4. 返回更新的记录数
 *
 * @param context - Astro API 上下文
 * @returns { updatedCount: number } 或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 解析请求体
		let ids: string[] | undefined;
		try {
			const body = await parseJsonBody(context.request);
			ids = body.ids;
		} catch {
			// 请求体为空或解析失败，ids 保持 undefined，标记全部已读
		}

		// 如果 ids 为空数组，也视为标记全部已读
		if (ids && ids.length === 0) {
			ids = undefined;
		}

		// 3. 限制 ids 数组长度，防止批量操作过大
		if (ids && ids.length > 100) {
			return jsonErrorResponse('通知 ID 数量不能超过 100');
		}

		// 3. 标记已读
		const updatedCount = await markNotificationsRead(currentUser.userId, ids);

		return new Response(JSON.stringify(successResponse({ updatedCount })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('标记已读失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
