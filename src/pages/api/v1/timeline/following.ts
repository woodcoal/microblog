import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parsePage, requireApiAuth } from '@/lib/api-v1';
import { getFollowingTimeline } from '@/services/api-v1.service';
export const GET: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		return jsonResponse(
			await getFollowingTimeline(auth.userId, parsePage(new URL(context.request.url)))
		);
	} catch (error) {
		return handleApiError(error);
	}
};
