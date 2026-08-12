import type { APIRoute } from 'astro';
import { consumeEmailVerificationToken } from '@/lib/email-verification';
import {
	handleApiError,
	jsonError,
	jsonResponse,
	parseJsonObject,
	stringValue
} from '@/lib/api-v1';

/** 无效、过期、重放均使用相同响应，避免令牌状态探测。 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		const verified = await consumeEmailVerificationToken(stringValue(body.token, 'token')!);
		if (!verified) return jsonError('验证链接无效或已失效', 'BAD_REQUEST');
		return jsonResponse({ verified: true });
	} catch (error) {
		return handleApiError(error);
	}
};
