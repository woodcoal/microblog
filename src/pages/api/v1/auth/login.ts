import type { APIRoute } from 'astro';
import { generateToken } from '@/lib/auth';
import { JWT_EXPIRES_DAYS } from '@/lib/config';
import { handleApiError, jsonResponse, parseJsonObject, stringValue } from '@/lib/api-v1';
import { loginUser } from '@/services/auth.service';
import { getUser } from '@/services/api-v1.service';
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		const user = await loginUser({
			email: stringValue(body.email, 'email')!,
			password: stringValue(body.password, 'password')!
		});
		const token = await generateToken({
			userId: user.id,
			username: user.username,
			role: user.role,
			credentialVersion: user.credentialVersion
		});
		return jsonResponse({
			token,
			expiresIn: JWT_EXPIRES_DAYS * 86400,
			user: await getUser(user.username)
		});
	} catch (error) {
		return handleApiError(error);
	}
};
