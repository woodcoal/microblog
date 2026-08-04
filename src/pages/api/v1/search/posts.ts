import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth, parsePage } from '@/lib/api-v1';
import { searchPublicPosts } from '@/services/api-v1.service';
export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const viewer = await optionalApiAuth(context);
		return jsonResponse(
			await searchPublicPosts(url.searchParams.get('q') ?? '', {
				...parsePage(url),
				viewerId: viewer?.userId
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
