/** Agent 通知已读 API。 */
import type { APIRoute } from 'astro';
import { handleAgentError, requireAgentAuth, textErrorResponse, textResponse } from '@/lib/agent';
import { markNotificationsReadService } from '@/services/notification.service';
import { parseJsonBody } from '@/lib/utils';

/**
 * 标记当前用户的通知为已读。
 * `ids` 省略或为空数组时，标记当前用户全部未读通知。
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		const rawBody = await parseJsonBody(context.request);
		if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
			return textErrorResponse('请求体必须是 JSON 对象');
		}
		const body = rawBody as { ids?: unknown };
		if (
			body.ids !== undefined &&
			(!Array.isArray(body.ids) ||
				!body.ids.every((id) => typeof id === 'string' && id.trim()))
		) {
			return textErrorResponse('ids 必须是非空通知 ID 字符串数组');
		}

		const result = await markNotificationsReadService({
			userId: authResult.userId,
			ids: body.ids?.map((id) => id.trim())
		});
		return textResponse(`ok: ${result.updatedCount}`);
	} catch (error) {
		return handleAgentError(error, '标记通知已读');
	}
};
