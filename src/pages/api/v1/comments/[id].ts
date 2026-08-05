import type { APIRoute } from 'astro';
import { handleApiError, requireApiAuth } from '@/lib/api-v1';
import { deleteComment } from '@/services/content.service';
export const DELETE: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		await deleteComment({ userId: auth.userId, commentId: context.params.id ?? '' });
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
