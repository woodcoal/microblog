/**
 * 管理后台辅助函数
 *
 * 提供管理员权限验证等公共功能，
 * 供管理后台页面和 API 复用。
 */
import type { APIRoute } from 'astro';
import { getUserFromRequest, type JwtPayload } from '@/lib/auth';
import { errorResponse } from '@/lib/utils';

/**
 * 验证当前用户是否为管理员
 *
 * 检查流程：
 * 1. 从请求中提取用户信息
 * 2. 未登录返回 401 错误响应
 * 3. 非 admin 角色返回 403 错误响应
 * 4. 是 admin 返回用户信息
 *
 * @param context - Astro API 上下文
 * @returns 管理员用户信息，或错误 Response
 */
export async function requireAdmin(
	context: Parameters<APIRoute>[0]
): Promise<JwtPayload | Response> {
	// 从请求中提取当前用户
	const user = await getUserFromRequest(context);

	// 未登录
	if (!user) {
		return new Response(JSON.stringify(errorResponse('请先登录', 401)), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 非管理员
	if (user.role !== 'admin') {
		return new Response(JSON.stringify(errorResponse('无权访问管理后台', 403)), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return user;
}
