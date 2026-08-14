import { SignJWT, jwtVerify } from 'jose';
import type { APIContext } from 'astro';
import { JWT_SECRET } from '@/lib/config';

export const POST_PASSWORD_ACCESS_COOKIE = 'mutan_post_access';
export const POST_PASSWORD_ACCESS_SECONDS = 10 * 60;
const secretKey = new TextEncoder().encode(JWT_SECRET);
type CookieContext = Pick<APIContext, 'request' | 'cookies'>;

/** 为已验证密码的浏览器签发短期、仅限单帖的访问凭据。 */
export async function setPostPasswordAccess(context: CookieContext, postId: string): Promise<void> {
	const token = await new SignJWT({ postId, purpose: 'post-password-access' })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${POST_PASSWORD_ACCESS_SECONDS}s`)
		.sign(secretKey);
	context.cookies.set(POST_PASSWORD_ACCESS_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: new URL(context.request.url).protocol === 'https:',
		maxAge: POST_PASSWORD_ACCESS_SECONDS
	});
}

/** 受控媒体只接受本帖、未过期且由服务端签发的密码访问凭据。 */
export async function hasPostPasswordAccess(request: Request, postId: string): Promise<boolean> {
	const token = request.headers
		.get('cookie')
		?.split(';')
		.map((item) => item.trim())
		.find((item) => item.startsWith(`${POST_PASSWORD_ACCESS_COOKIE}=`))
		?.slice(POST_PASSWORD_ACCESS_COOKIE.length + 1);
	if (!token) return false;
	try {
		const { payload } = await jwtVerify(token, secretKey);
		return payload.purpose === 'post-password-access' && payload.postId === postId;
	} catch {
		return false;
	}
}
