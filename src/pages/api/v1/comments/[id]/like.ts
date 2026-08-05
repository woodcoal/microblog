import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { toggleLike } from '@/services/social.service';
export const PUT: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const result = await toggleLike({
			userId: auth.userId,
			targetId: context.params.id ?? '',
			type: 'comment'
		});
		return jsonResponse({ active: result.liked, count: result.likeCount });
	} catch (error) {
		return handleApiError(error);
	}
};
