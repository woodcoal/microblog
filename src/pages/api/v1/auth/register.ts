import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, parseJsonObject, stringValue } from '@/lib/api-v1';
import { registerUser } from '@/services/auth.service';
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		const user = await registerUser({
			username: stringValue(body.username, 'username', false),
			displayName: stringValue(body.displayName, 'displayName', false),
			email: stringValue(body.email, 'email')!,
			password: stringValue(body.password, 'password')!
		});
		return jsonResponse({ ...user, message: '若邮箱可用，验证邮件已发送' }, 201);
	} catch (error) {
		return handleApiError(error);
	}
};
