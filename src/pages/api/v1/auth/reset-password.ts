import type { APIRoute } from 'astro';
import {
	handleApiError,
	jsonError,
	jsonResponse,
	parseJsonObject,
	stringValue
} from '@/lib/api-v1';
import { resetPassword } from '@/services/auth.service';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		const reset = await resetPassword({
			token: stringValue(body.token, 'token')!,
			password: stringValue(body.password, 'password')!
		});
		if (!reset) return jsonError('重置链接无效或已失效', 'BAD_REQUEST');
		return jsonResponse({ reset: true });
	} catch (error) {
		return handleApiError(error);
	}
};
