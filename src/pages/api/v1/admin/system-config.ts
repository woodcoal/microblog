import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, requireApiAuth } from '@/lib/api-v1';
import {
	readSystemConfiguration,
	updateSystemConfiguration
} from '@/services/system-config.service';

export const GET: APIRoute = async (context) => {
	const user = await requireApiAuth(context);
	if (user instanceof Response) return user;
	try {
		return jsonResponse(await readSystemConfiguration(user.userId));
	} catch (error) {
		return handleApiError(error);
	}
};
export const PUT: APIRoute = async (context) => {
	const user = await requireApiAuth(context);
	if (user instanceof Response) return user;
	try {
		const body = await parseJsonObject(context.request);
		return jsonResponse(
			await updateSystemConfiguration({
				userId: user.userId,
				emailOwnershipEnabled:
					typeof body.emailOwnershipEnabled === 'boolean'
						? body.emailOwnershipEnabled
						: undefined,
				smtp: body.smtp && typeof body.smtp === 'object' ? (body.smtp as never) : undefined,
				watermark:
					body.watermark && typeof body.watermark === 'object'
						? (body.watermark as never)
						: undefined
			})
		);
	} catch (error) {
		return handleApiError(error);
	}
};
