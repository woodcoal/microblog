/**
 * 同步器 CSRF token
 *
 * Token 放在 HttpOnly cookie 中，SSR 页面将同一个值注入 meta 标签。
 * 浏览器端通过 X-CSRF-Token header（或表单字段）回传，服务端比较两者。
 * 攻击者无法读取同源页面，因此即使 cookie 会随跨站请求发送，也无法构造
 * 合法的 token。
 */
import type { APIContext } from 'astro';

export const CSRF_COOKIE_NAME = 'mutan_csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';
export const CSRF_FIELD_NAME = 'csrf_token';

const TOKEN_BYTES = 32;
const TOKEN_MAX_AGE_SECONDS = 2 * 60 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type CsrfContext = Pick<APIContext, 'request' | 'cookies'>;

/** 使用 Web Crypto 生成不可预测的 URL-safe token。 */
export function createCsrfToken(): string {
	const bytes = new Uint8Array(TOKEN_BYTES);
	globalThis.crypto.getRandomValues(bytes);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 复用当前 cookie，首次访问时创建并写入 cookie。 */
export function getOrCreateCsrfToken(context: CsrfContext): string {
	const existing = context.cookies.get(CSRF_COOKIE_NAME)?.value;
	if (existing && TOKEN_PATTERN.test(existing)) return existing;

	const token = createCsrfToken();
	const isSecure = new URL(context.request.url).protocol === 'https:';
	context.cookies.set(CSRF_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: TOKEN_MAX_AGE_SECONDS
	});
	return token;
}

/** 常量时间比较，避免 token 比较泄露可利用的时序信息。 */
function safeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return difference === 0;
}

/**
 * 验证 Action 或表单请求中的 CSRF token。
 * Header 优先；普通 HTML 表单则从 clone 后的 body 读取隐藏字段，避免消费原请求体。
 */
export async function validateCsrfToken(
	request: Request,
	cookies: CsrfContext['cookies']
): Promise<boolean> {
	const expected = cookies.get(CSRF_COOKIE_NAME)?.value;
	if (!expected || !TOKEN_PATTERN.test(expected)) return false;

	let supplied = request.headers.get(CSRF_HEADER_NAME);
	if (!supplied) {
		const contentType = request.headers.get('content-type') || '';
		if (
			contentType.startsWith('application/x-www-form-urlencoded') ||
			contentType.startsWith('multipart/form-data')
		) {
			try {
				const formData = await request.clone().formData();
				const value = formData.get(CSRF_FIELD_NAME);
				if (typeof value === 'string') supplied = value;
			} catch {
				return false;
			}
		}
	}

	return Boolean(supplied && TOKEN_PATTERN.test(supplied) && safeEqual(expected, supplied));
}

/** 统一的 CSRF 失败响应，便于客户端和日志识别。 */
export function csrfFailureResponse(): Response {
	return new Response(
		JSON.stringify({
			success: false,
			error: { message: 'CSRF token 无效或缺失', status: 403 }
		}),
		{
			status: 403,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		}
	);
}
