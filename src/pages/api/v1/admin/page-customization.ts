import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, requireApiAuth } from '@/lib/api-v1';
import { ServiceError } from '@/lib/errors';
import {
	readPageCustomization,
	updatePageCustomization
} from '@/services/page-customization.service';

export const GET: APIRoute = async (context) => {
	const user = await requireApiAuth(context);
	if (user instanceof Response) return user;
	try {
		return jsonResponse(await readPageCustomization(user.userId));
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: APIRoute = async (context) => {
	const user = await requireApiAuth(context);
	if (user instanceof Response) return user;
	try {
		const body = await parseJsonObject(context.request);
		if (body.footerMarkdown !== undefined && typeof body.footerMarkdown !== 'string')
			throw new ServiceError('BAD_REQUEST', 'footerMarkdown 必须是字符串');
		if (
			body.publicAnalyticsScript !== undefined &&
			typeof body.publicAnalyticsScript !== 'string'
		)
			throw new ServiceError('BAD_REQUEST', 'publicAnalyticsScript 必须是字符串');
		return jsonResponse(
			await updatePageCustomization({
				userId: user.userId,
				footerMarkdown: body.footerMarkdown as string | undefined,
				publicAnalyticsScript: body.publicAnalyticsScript as string | undefined
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
