import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, stringValue } from '@/lib/api-v1';
import { registerUser } from '@/services/auth.service';
import { getUser } from '@/services/api-v1.service';
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		const user = await registerUser({
			username: stringValue(body.username, 'username', false),
			displayName: stringValue(body.displayName, 'displayName', false),
			email: stringValue(body.email, 'email')!,
			password: stringValue(body.password, 'password')!
		});
		return jsonResponse(
			{ ...(await getUser(user.username)), email: user.email, role: user.role },
			201
		);
	} catch (error) {
		return handleApiError(error);
	}
};
