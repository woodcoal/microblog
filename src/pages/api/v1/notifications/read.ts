/** 当前 Bearer 用户的通知已读 API。 */
import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, requireApiAuth } from '@/lib/api-v1';
import { ServiceError } from '@/lib/errors';
import { markNotificationsReadService } from '@/services/notification.service';

/**
 * 标记当前用户的通知为已读。
 * `ids` 省略或为空数组时，标记当前用户全部未读通知。
 */
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;

		const body = await parseJsonObject(context.request);
		const rawIds = body.ids;
		if (
			rawIds !== undefined &&
			(!Array.isArray(rawIds) || !rawIds.every((id) => typeof id === 'string' && id.trim()))
		) {
			throw new ServiceError('BAD_REQUEST', 'ids 必须是非空通知 ID 字符串数组');
		}

		return jsonResponse(
			await markNotificationsReadService({
				userId: auth.userId,
				ids: rawIds?.map((id) => id.trim())
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
