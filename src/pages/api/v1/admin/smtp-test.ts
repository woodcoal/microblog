import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, requireApiAuth } from '@/lib/api-v1';
import { testSystemSmtp } from '@/services/system-config.service';

export const POST: APIRoute = async (context) => {
	const user = await requireApiAuth(context);
	if (user instanceof Response) return user;
	try {
		const body = await parseJsonObject(context.request);
		await testSystemSmtp(
			user.userId,
			body.smtp && typeof body.smtp === 'object' ? (body.smtp as never) : undefined
		);
		return jsonResponse({ tested: true });
	} catch (error) {
		return handleApiError(error);
	}
};
