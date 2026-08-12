import type { APIRoute } from 'astro';
import {
	requireApiAuth,
	handleApiError,
	jsonResponse,
	parseJsonObject,
	stringValue
} from '@/lib/api-v1';
import { requestEmailChange } from '@/services/auth.service';

/** 当前 Bearer 凭据与当前密码均通过后才会向新邮箱投递确认链接。 */
export const POST: APIRoute = async (context) => {
	const currentUser = await requireApiAuth(context);
	if (currentUser instanceof Response) return currentUser;
	try {
		const body = await parseJsonObject(context.request);
		await requestEmailChange({
			userId: currentUser.userId,
			currentPassword: stringValue(body.currentPassword, 'currentPassword')!,
			targetEmail: stringValue(body.targetEmail, 'targetEmail')!
		});
		return jsonResponse({ accepted: true, message: '若新邮箱可用，确认邮件已发送' }, 202);
	} catch (error) {
		return handleApiError(error);
	}
};
