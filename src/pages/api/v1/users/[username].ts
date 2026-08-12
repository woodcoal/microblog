import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, optionalApiAuth } from '@/lib/api-v1';
import { getUser } from '@/services/api-v1.service';
import { resolveUsername } from '@/lib/user';
export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		const resolved = await resolveUsername(context.params.username ?? '');
		if (!resolved) return jsonResponse(await getUser('', viewer?.userId));
		if (resolved.isLegacy)
			return new Response(null, {
				status: 308,
				headers: { Location: `/api/v1/users/${encodeURIComponent(resolved.username)}` }
			});
		return jsonResponse(await getUser(resolved.username, viewer?.userId));
	} catch (error) {
		return handleApiError(error);
	}
};
