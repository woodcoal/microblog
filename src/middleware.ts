/**
 * 全局请求安全中间件。
 *
 * Agent 与 v1 外部 API 走 CORS、限流和请求体检查；
 * 所有浏览器端 unsafe 请求（尤其 Astro Actions）走同步器 CSRF 校验。
 */
import { defineMiddleware } from 'astro:middleware';
import {
	bodyLimitResponse,
	checkBodyLimit,
	consumeRateLimit,
	corsRejectedResponse,
	getBodyLimit,
	isUploadRoute,
	handleCorsPreflight,
	isAllowedCorsOrigin,
	isApiRoute,
	isV1ApiRoute,
	rateLimitExceededResponse,
	withCorsHeaders,
	withRateLimitHeaders
} from '@/lib/api-security';
import { API_AGENT_ENABLED, API_V1_ENABLED } from '@/lib/config';
import { getUserFromRequest } from '@/lib/auth';
import { getOrCreateCsrfToken, csrfFailureResponse, validateCsrfToken } from '@/lib/csrf';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_FORBIDDEN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>无权访问</title></head>
<body><main><p aria-hidden="true">403</p><h1>无权访问管理后台</h1><p>当前账号不具备管理权限。</p><a href="/">返回首页</a></main></body>
</html>`;

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;
	const csrfToken = getOrCreateCsrfToken(context);
	context.locals.csrfToken = csrfToken;
	const isAdminRoute = url.pathname === '/admin' || url.pathname.startsWith('/admin/');

	// 布局组件无法向页面路由返回 Response，权限分支必须在中间件中短路，
	// 才能保证未登录重定向和普通用户 403 都保留正确 HTTP 状态。
	if (isAdminRoute) {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) return Response.redirect(new URL('/login', url), 302);
		if (currentUser.role !== 'admin') {
			return new Response(ADMIN_FORBIDDEN_PAGE, {
				status: 403,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-store'
				}
			});
		}
	}

	// 五种上传协议只经过这一处请求体门禁，且早于 API、Action、CSRF 的所有解析。
	if (UNSAFE_METHODS.has(request.method.toUpperCase()) && isUploadRoute(url.pathname)) {
		const bodyResult = await checkBodyLimit(request, getBodyLimit(url.pathname));
		if (!bodyResult.allowed) {
			const response = bodyLimitResponse(
				bodyResult,
				isV1ApiRoute(url.pathname),
				url.pathname === '/api/agent/upload'
			);
			return isApiRoute(url.pathname) ? withCorsHeaders(response, request) : response;
		}
	}

	if (isApiRoute(url.pathname)) {
		const isV1 = isV1ApiRoute(url.pathname);
		if ((isV1 && !API_V1_ENABLED) || (!isV1 && !API_AGENT_ENABLED)) {
			return new Response(
				isV1
					? JSON.stringify({ error: { code: 'NOT_FOUND', message: 'API v1 接口未启用' } })
					: 'error: Agent API 接口未启用',
				{
					status: 404,
					headers: {
						'Content-Type': isV1
							? 'application/json; charset=utf-8'
							: 'text/plain; charset=utf-8',
						'Cache-Control': 'no-store'
					}
				}
			);
		}

		if (!isAllowedCorsOrigin(request)) {
			return withCorsHeaders(corsRejectedResponse(isV1), request);
		}

		if (request.method.toUpperCase() === 'OPTIONS') {
			return withCorsHeaders(handleCorsPreflight(request, isV1), request);
		}

		const rateLimitInfo = consumeRateLimit(request, url.pathname);
		if (!rateLimitInfo.allowed) {
			return withCorsHeaders(
				withRateLimitHeaders(rateLimitExceededResponse(rateLimitInfo, isV1), rateLimitInfo),
				request
			);
		}

		const response = await next();
		return withCorsHeaders(withRateLimitHeaders(response, rateLimitInfo), request);
	}

	// Astro Actions 和普通 SSR 表单都必须带同步器 token；GET/HEAD 不改变状态，放行。
	if (UNSAFE_METHODS.has(request.method.toUpperCase())) {
		const valid = await validateCsrfToken(request, context.cookies);
		if (!valid) return csrfFailureResponse();
	}

	return next();
});
