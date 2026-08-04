import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse } from '@/lib/api-v1';
import { getUser } from '@/services/api-v1.service';
export const GET: APIRoute = async ({ params }) => {
	try {
		return jsonResponse(await getUser(params.username ?? ''));
	} catch (error) {
		return handleApiError(error);
	}
};
