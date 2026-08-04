import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parsePage } from '@/lib/api-v1';
import { searchPublicUsers } from '@/services/api-v1.service';
export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		return jsonResponse(
			await searchPublicUsers(url.searchParams.get('q') ?? '', parsePage(url))
		);
	} catch (error) {
		return handleApiError(error);
	}
};
