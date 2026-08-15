/** Agent 评论删除 API。 */
import type { APIRoute } from 'astro';
import { handleAgentError, requireAgentAuth, textResponse } from '@/lib/agent';
import { deleteComment } from '@/services/content.service';

/** 删除当前用户自己的评论（软删除）。 */
export const DELETE: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		await deleteComment({ userId: authResult.userId, commentId: context.params.id ?? '' });
		return textResponse('ok');
	} catch (error) {
		return handleAgentError(error, '删除评论');
	}
};
