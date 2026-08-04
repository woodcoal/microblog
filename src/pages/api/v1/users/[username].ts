import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth } from '@/lib/api-v1';
import { getUser } from '@/services/api-v1.service';
export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		return jsonResponse(await getUser(context.params.username ?? '', viewer?.userId));
	} catch (error) {
		return handleApiError(error);
	}
};
