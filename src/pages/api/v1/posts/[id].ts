import type { APIRoute } from 'astro';
import {
	handleApiError,
	jsonResponse,
	optionalApiAuth,
	parseJsonObject,
	requireApiAuth,
	stringValue
} from '@/lib/api-v1';
import { deletePost, updatePost } from '@/services/content.service';
import { getPostForApi, getPublicPost } from '@/services/api-v1.service';

export const GET: APIRoute = async (context) => {
	try {
		const viewer = await optionalApiAuth(context);
		const password = new URL(context.request.url).searchParams.get('password') ?? undefined;
		return jsonResponse(await getPublicPost(context.params.id ?? '', viewer?.userId, password));
	} catch (error) {
		return handleApiError(error);
	}
};
export const PUT: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const body = await parseJsonObject(context.request);
		const content = stringValue(body.content, 'content')!;
		const mediaIds =
			Array.isArray(body.mediaIds) && body.mediaIds.every((id) => typeof id === 'string')
				? body.mediaIds
				: undefined;
		const allowedUserIds =
			Array.isArray(body.allowedUserIds) &&
			body.allowedUserIds.every((id) => typeof id === 'string')
				? body.allowedUserIds
				: undefined;
		await updatePost({
			userId: auth.userId,
			postId: context.params.id ?? '',
			content,
			title: stringValue(body.title, 'title', false),
			mode: stringValue(body.mode, 'mode', false),
			visibility: stringValue(body.visibility, 'visibility', false),
			mediaIds,
			password: stringValue(body.password, 'password', false),
			allowedUserIds,
			categoryId: stringValue(body.categoryId, 'categoryId', false)
		});
		return jsonResponse(await getPostForApi(context.params.id ?? '', auth.userId));
	} catch (error) {
		return handleApiError(error);
	}
};
export const DELETE: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		await deletePost({ userId: auth.userId, postId: context.params.id ?? '' });
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
