import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth, parsePage } from '@/lib/api-v1';
import { getUserPosts } from '@/services/api-v1.service';
export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		return jsonResponse(
			await getUserPosts(context.params.username ?? '', {
				...parsePage(new URL(context.request.url)),
				viewerId: viewer?.userId
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
