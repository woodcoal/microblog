/**
 * 用户登出 API
 *
 * POST /api/auth/logout
 * 清除 token cookie，返回 JSON 成功响应。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { clearTokenCookie } from '@/lib/auth';
import { successResponse } from '@/lib/utils';

/**
 * 登出接口
 *
 * 清除服务端 HttpOnly cookie 中的 token。
 * 前端也应同时清除 localStorage 中的 token。
 *
 * @param context - Astro API 上下文
 * @returns JSON 成功响应
 */
export const POST: APIRoute = async (context) => {
	clearTokenCookie(context);
	return new Response(JSON.stringify(successResponse({ message: '已登出' })), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
