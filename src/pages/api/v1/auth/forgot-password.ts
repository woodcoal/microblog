import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, stringValue } from '@/lib/api-v1';
import { requestPasswordResetForEmail } from '@/services/auth.service';

/** 始终返回同一成功体，防止邮箱、禁用状态及限频窗口被枚举。 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		await requestPasswordResetForEmail(stringValue(body.email, 'email')!);
		return jsonResponse({ accepted: true, message: '若邮箱可用，重置邮件已发送' });
	} catch (error) {
		return handleApiError(error);
	}
};
