import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth, parsePage } from '@/lib/api-v1';
import { getUserPosts } from '@/services/api-v1.service';
import { resolveUsername } from '@/lib/user';
export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		const resolved = await resolveUsername(context.params.username ?? '');
		if (!resolved)
			return jsonResponse(
				await getUserPosts('', {
					...parsePage(new URL(context.request.url)),
					viewerId: viewer?.userId
				})
			);
		if (resolved.isLegacy)
			return new Response(null, {
				status: 308,
				headers: {
					Location: `/api/v1/users/${encodeURIComponent(resolved.username)}/posts${new URL(context.request.url).search}`
				}
			});
		return jsonResponse(
			await getUserPosts(resolved.username, {
				...parsePage(new URL(context.request.url)),
				viewerId: viewer?.userId
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
