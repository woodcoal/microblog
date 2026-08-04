import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parsePage } from '@/lib/api-v1';
import { getUserPosts } from '@/services/api-v1.service';
export const GET: APIRoute = async ({ params, request }) => {
	try {
		return jsonResponse(
			await getUserPosts(params.username ?? '', parsePage(new URL(request.url)))
		);
	} catch (error) {
		return handleApiError(error);
	}
};
