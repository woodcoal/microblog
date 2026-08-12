import type { APIRoute } from 'astro';
import {
	handleApiError,
	jsonError,
	jsonResponse,
	parseJsonObject,
	stringValue
} from '@/lib/api-v1';
import { confirmEmailChange } from '@/services/auth.service';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		if (!(await confirmEmailChange(stringValue(body.token, 'token')!))) {
			return jsonError('确认链接无效或已失效', 'BAD_REQUEST');
		}
		return jsonResponse({ changed: true });
	} catch (error) {
		return handleApiError(error);
	}
};
