/** /api/v1 的 JSON transport 辅助函数。 */
import type { APIContext } from 'astro';
import { getUserFromRequest, type JwtPayload } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';

const statusByCode = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404
} as const;
type ErrorCode = keyof typeof statusByCode | 'INTERNAL_ERROR';

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}

export function jsonError(
	message: string,
	code: ErrorCode,
	status = statusByCode[code as keyof typeof statusByCode] ?? 500
): Response {
	return jsonResponse({ error: { code, message } }, status);
}

export async function requireApiAuth(
	context: Pick<APIContext, 'request' | 'cookies'>
): Promise<JwtPayload | Response> {
	const user = await getUserFromRequest(context);
	return user ?? jsonError('请先登录', 'UNAUTHORIZED');
}

export async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
	try {
		const value: unknown = await request.json();
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
		return value as Record<string, unknown>;
	} catch {
		throw new ServiceError('BAD_REQUEST', '请求体必须是 JSON 对象');
	}
}

export function parsePage(url: URL): { page: number; pageSize: number } {
	const page = Number(url.searchParams.get('page') ?? '1');
	const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
	if (
		!Number.isInteger(page) ||
		page < 1 ||
		!Number.isInteger(pageSize) ||
		pageSize < 1 ||
		pageSize > 100
	)
		throw new ServiceError('BAD_REQUEST', 'page 或 pageSize 无效');
	return { page, pageSize };
}

export function handleApiError(error: unknown): Response {
	if (error instanceof ServiceError) return jsonError(error.message, error.code);
	console.error('v1 API 请求失败:', error);
	return jsonError('服务器内部错误', 'INTERNAL_ERROR');
}

export function stringValue(value: unknown, name: string, required = true): string | undefined {
	if (value === undefined && !required) return undefined;
	if (typeof value !== 'string' || !value.trim())
		throw new ServiceError('BAD_REQUEST', `${name} 不能为空`);
	return value.trim();
}
