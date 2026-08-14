/**
 * API 安全基线
 *
 * 中间件会把这些检查应用到 /api/agent/* 与 /api/v1/*：
 * - CORS 只允许 API_CORS_ORIGINS 中的精确来源
 * - 速率限制按 IP + 路由隔离，读/写/上传采用不同阈值
 * - 请求体在进入路由前限制大小，避免大 payload 消耗业务资源
 */
import {
	API_BODY_LIMIT_BYTES,
	API_CORS_ORIGINS,
	API_RATE_LIMIT_READ,
	API_RATE_LIMIT_UPLOAD,
	API_RATE_LIMIT_WINDOW_SECONDS,
	API_RATE_LIMIT_WRITE,
	API_UPLOAD_BODY_LIMIT_BYTES
} from '@/lib/config';

const API_PREFIXES = ['/api/agent', '/api/v1'];
const API_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const API_CORS_HEADERS = ['accept', 'authorization', 'content-type', 'x-csrf-token'];
const rateLimitBuckets = new Map<string, number[]>();

export interface RateLimitInfo {
	allowed: boolean;
	limit: number;
	remaining: number;
	retryAfter: number;
}

export function isApiRoute(pathname: string): boolean {
	return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** v1 路由使用与 OpenAPI 一致的错误体；旧 Agent API 保持兼容格式。 */
export function isV1ApiRoute(pathname: string): boolean {
	return pathname === '/api/v1' || pathname.startsWith('/api/v1/');
}

export function isUploadRoute(pathname: string): boolean {
	return (
		pathname === '/api/upload' ||
		pathname === '/api/agent/upload' ||
		pathname === '/api/v1/upload' ||
		pathname === '/_actions/uploadMedia' ||
		pathname === '/_actions/uploadAvatar'
	);
}

function normalizeOrigin(origin: string): string | null {
	try {
		const url = new URL(origin);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
}

/** 返回请求是否来自配置的来源；没有 Origin 的非浏览器请求不参与 CORS。 */
export function isAllowedCorsOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true;

	const normalizedOrigin = normalizeOrigin(origin);
	if (!normalizedOrigin) return false;
	const sameOrigin = new URL(request.url).origin;

	return API_CORS_ORIGINS.some((allowed) => {
		if (allowed.toLowerCase() === 'self') return normalizedOrigin === sameOrigin;
		return normalizeOrigin(allowed) === normalizedOrigin;
	});
}

/** 将 CORS 响应头附加到成功、错误和限流响应，保证客户端能读取状态。 */
export function withCorsHeaders(response: Response, request: Request): Response {
	const headers = new Headers(response.headers);
	const origin = request.headers.get('origin');
	if (origin && isAllowedCorsOrigin(request)) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Vary', 'Origin');
	}
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export function corsRejectedResponse(v1 = false): Response {
	return new Response(
		v1
			? JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
			: 'Origin not allowed',
		{
			status: 403,
			headers: {
				'Content-Type': v1 ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8'
			}
		}
	);
}

/** 处理预检请求，并拒绝未声明的方法或请求头。 */
export function handleCorsPreflight(request: Request, v1 = false): Response {
	const requestedMethod = request.headers.get('access-control-request-method');
	if (requestedMethod && !API_METHODS.includes(requestedMethod.toUpperCase())) {
		return corsRejectedResponse(v1);
	}

	const requestedHeaders = (request.headers.get('access-control-request-headers') || '')
		.split(',')
		.map((header) => header.trim().toLowerCase())
		.filter(Boolean);
	if (requestedHeaders.some((header) => !API_CORS_HEADERS.includes(header))) {
		return corsRejectedResponse(v1);
	}

	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Methods': API_METHODS.join(', '),
			'Access-Control-Allow-Headers': API_CORS_HEADERS.join(', '),
			'Access-Control-Max-Age': '600',
			'Cache-Control': 'no-store'
		}
	});
}

function getClientIp(request: Request): string {
	// 部署在反向代理后时优先使用代理注入的地址；无法获取时退回稳定占位符。
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	return (
		request.headers.get('cf-connecting-ip')?.trim() ||
		request.headers.get('x-real-ip')?.trim() ||
		forwarded ||
		'unknown'
	);
}

function getRateLimit(pathname: string, method: string): number {
	if (isUploadRoute(pathname)) return API_RATE_LIMIT_UPLOAD;
	return method === 'GET' || method === 'HEAD' ? API_RATE_LIMIT_READ : API_RATE_LIMIT_WRITE;
}

/** 消费一个 IP + 路由桶中的配额，并返回响应头所需的剩余信息。 */
export function consumeRateLimit(
	request: Request,
	pathname: string,
	now = Date.now()
): RateLimitInfo {
	const limit = getRateLimit(pathname, request.method.toUpperCase());
	const windowMs = API_RATE_LIMIT_WINDOW_SECONDS * 1000;
	const key = `${getClientIp(request)}:${pathname}`;
	const current = (rateLimitBuckets.get(key) || []).filter(
		(timestamp) => timestamp > now - windowMs
	);
	const allowed = current.length < limit;
	if (allowed) current.push(now);
	rateLimitBuckets.set(key, current);

	// 防止长期运行的进程积累已过期的客户端桶。
	if (rateLimitBuckets.size > 10000) {
		for (const [bucketKey, timestamps] of rateLimitBuckets) {
			if (timestamps.every((timestamp) => timestamp <= now - windowMs)) {
				rateLimitBuckets.delete(bucketKey);
			}
			if (rateLimitBuckets.size <= 9000) break;
		}
	}

	const oldest = current[0] || now;
	return {
		allowed,
		limit,
		remaining: Math.max(0, limit - current.length),
		retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
	};
}

export function withRateLimitHeaders(response: Response, info: RateLimitInfo): Response {
	const headers = new Headers(response.headers);
	headers.set('X-RateLimit-Limit', String(info.limit));
	headers.set('X-RateLimit-Remaining', String(info.remaining));
	if (response.status === 429) headers.set('Retry-After', String(info.retryAfter));
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export function rateLimitExceededResponse(info: RateLimitInfo, v1 = false): Response {
	return new Response(
		JSON.stringify(
			v1
				? { error: { code: 'BAD_REQUEST', message: '请求过于频繁，请稍后再试' } }
				: { success: false, error: { message: '请求过于频繁，请稍后再试', status: 429 } }
		),
		{
			status: 429,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
				'Retry-After': String(info.retryAfter)
			}
		}
	);
}

export interface BodyLimitResult {
	allowed: boolean;
	malformedLength?: boolean;
}

/**
 * 检查请求体大小。Content-Length 可直接拒绝；chunked 请求则读取 clone，
 * 超限时立即取消 clone，原请求仍保留给 Astro 路由消费。
 */
export async function checkBodyLimit(request: Request, limit: number): Promise<BodyLimitResult> {
	const contentLength = request.headers.get('content-length');
	if (contentLength !== null) {
		const length = Number(contentLength);
		if (!Number.isFinite(length) || length < 0)
			return { allowed: false, malformedLength: true };
		if (length > limit) return { allowed: false };
		return { allowed: true };
	}

	if (!request.body) return { allowed: true };
	try {
		const reader = request.clone().body?.getReader();
		if (!reader) return { allowed: true };
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				// 不等待 tee 分支的 cancel：原请求仍由后续路由消费，等待会阻塞。
				void reader.cancel().catch(() => {});
				return { allowed: false };
			}
		}
		return { allowed: true };
	} catch {
		return { allowed: false };
	}
}

export function bodyLimitResponse(result: BodyLimitResult, v1 = false, agent = false): Response {
	const message = result.malformedLength ? 'Content-Length 无效' : '请求体超过大小限制';
	return new Response(
		agent
			? `error: ${message}`
			: JSON.stringify(
					v1
						? { error: { code: 'BAD_REQUEST', message } }
						: {
								success: false,
								error: { message, status: result.malformedLength ? 400 : 413 }
							}
				),
		{
			status: result.malformedLength ? 400 : 413,
			headers: {
				'Content-Type': agent
					? 'text/plain; charset=utf-8'
					: 'application/json; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		}
	);
}

export function getBodyLimit(pathname: string): number {
	return isUploadRoute(pathname) ? API_UPLOAD_BODY_LIMIT_BYTES : API_BODY_LIMIT_BYTES;
}
