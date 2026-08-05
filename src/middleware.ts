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
	handleCorsPreflight,
	isAllowedCorsOrigin,
	isApiRoute,
	isV1ApiRoute,
	rateLimitExceededResponse,
	withCorsHeaders,
	withRateLimitHeaders
} from '@/lib/api-security';
import { getOrCreateCsrfToken, csrfFailureResponse, validateCsrfToken } from '@/lib/csrf';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;
	const csrfToken = getOrCreateCsrfToken(context);
	context.locals.csrfToken = csrfToken;

	if (isApiRoute(url.pathname)) {
		const isV1 = isV1ApiRoute(url.pathname);
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

		if (UNSAFE_METHODS.has(request.method.toUpperCase())) {
			const bodyResult = await checkBodyLimit(request, getBodyLimit(url.pathname));
			if (!bodyResult.allowed) {
				return withCorsHeaders(
					withRateLimitHeaders(bodyLimitResponse(bodyResult, isV1), rateLimitInfo),
					request
				);
			}
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
