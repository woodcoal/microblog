import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth, parsePage } from '@/lib/api-v1';
import { getTagPosts } from '@/services/api-v1.service';
export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		return jsonResponse(
			await getTagPosts(context.params.name ?? '', {
				...parsePage(new URL(context.request.url)),
				viewerId: viewer?.userId
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
