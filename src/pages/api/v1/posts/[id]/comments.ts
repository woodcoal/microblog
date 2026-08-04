import type { APIRoute } from 'astro';
import {
	handleApiError,
	jsonResponse,
	optionalApiAuth,
	parseJsonObject,
	parsePage,
	requireApiAuth,
	stringValue
} from '@/lib/api-v1';
import { createComment } from '@/services/content.service';
import { getPostComments, toCreatedCommentDto } from '@/services/api-v1.service';

export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const viewer = await optionalApiAuth(context);
		const page = parsePage(url);
		return jsonResponse(
			await getPostComments(context.params.id ?? '', {
				...page,
				viewerId: viewer?.userId,
				password: url.searchParams.get('password') ?? undefined
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const body = await parseJsonObject(context.request);
		const result = await createComment({
			userId: auth.userId,
			postId: context.params.id ?? '',
			content: stringValue(body.content, 'content')!,
			parentId: stringValue(body.parentId, 'parentId', false)
		});
		return jsonResponse(toCreatedCommentDto(result), 201);
	} catch (error) {
		return handleApiError(error);
	}
};
