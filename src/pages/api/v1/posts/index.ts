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
import { createPost } from '@/services/content.service';
import { getPostForApi, getPublicPosts } from '@/services/api-v1.service';

export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const { page, pageSize } = parsePage(url);
		const viewer = await optionalApiAuth(context);
		const sort = url.searchParams.get('sort');
		if (sort && sort !== 'latest' && sort !== 'hot')
			return handleApiError(new Error('invalid sort'));
		return jsonResponse(
			await getPublicPosts({
				page,
				pageSize,
				viewerId: viewer?.userId,
				sort: (sort as 'latest' | 'hot' | null) ?? undefined
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
		const result = await createPost({
			userId: auth.userId,
			content,
			title: stringValue(body.title, 'title', false),
			mode: stringValue(body.mode, 'mode', false),
			visibility: stringValue(body.visibility, 'visibility', false),
			mediaIds,
			password: stringValue(body.password, 'password', false),
			allowedUserIds,
			categoryId: stringValue(body.categoryId, 'categoryId', false),
			customCategory: stringValue(body.customCategory, 'customCategory', false)
		});
		return jsonResponse(await getPostForApi(result.id, auth.userId), 201);
	} catch (error) {
		return handleApiError(error);
	}
};
