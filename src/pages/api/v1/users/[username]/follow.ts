import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { toggleFollow } from '@/services/social.service';
import { resolveUsername } from '@/lib/user';
export const PUT: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const resolved = await resolveUsername(context.params.username ?? '');
		if (resolved?.isLegacy)
			return new Response(null, {
				status: 308,
				headers: {
					Location: `/api/v1/users/${encodeURIComponent(resolved.username)}/follow`
				}
			});
		const result = await toggleFollow({
			userId: auth.userId,
			username: resolved?.username ?? ''
		});
		return jsonResponse({ active: result.following, count: result.followerCount });
	} catch (error) {
		return handleApiError(error);
	}
};
