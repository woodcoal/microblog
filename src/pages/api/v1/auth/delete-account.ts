import type { APIRoute } from 'astro';
import {
	handleApiError,
	jsonResponse,
	parseJsonObject,
	requireApiAuth,
	stringValue
} from '@/lib/api-v1';
import { deleteAccount } from '@/services/account-deletion.service';

/** 永久注销。认证和当前密码都通过后才会开始不可恢复的事务。 */
export const POST: APIRoute = async (context) => {
	const currentUser = await requireApiAuth(context);
	if (currentUser instanceof Response) return currentUser;
	try {
		const body = await parseJsonObject(context.request);
		await deleteAccount({
			userId: currentUser.userId,
			currentPassword: stringValue(body.currentPassword, 'currentPassword')!
		});
		return jsonResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
