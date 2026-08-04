import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { toggleFollow } from '@/services/social.service';
export const PUT: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const result = await toggleFollow({
			userId: auth.userId,
			username: context.params.username ?? ''
		});
		return jsonResponse({ active: result.following, count: result.followerCount });
	} catch (error) {
		return handleApiError(error);
	}
};
