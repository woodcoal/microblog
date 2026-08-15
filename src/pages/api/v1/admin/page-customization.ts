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
		if (typeof body.publicAnalyticsScript !== 'string')
			throw new ServiceError('BAD_REQUEST', '统计脚本必须是字符串');
		return jsonResponse(
			await updatePageCustomization({
				userId: user.userId,
				publicAnalyticsScript: body.publicAnalyticsScript
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
