/**
 * Agent 用户详情 API
 *
 * GET /api/agent/users/:username — 获取用户详情
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse, formatUserDetail } from '@/lib/agent';
import { getUserDetail } from '@/services/user.service';
import { resolveUsername } from '@/lib/user';

/**
 * 获取用户详情
 *
 * 返回用户的 username、displayName、bio、avatarUrl、微博/关注/粉丝数、注册时间。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的用户详情
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		const { username } = context.params;
		if (!username) {
			return textErrorResponse('用户名不能为空');
		}

		// 通过 service 查询用户
		const resolved = await resolveUsername(username);
		if (resolved?.isLegacy)
			return new Response(`redirect: /api/agent/users/${resolved.username}`, {
				status: 308,
				headers: { Location: `/api/agent/users/${encodeURIComponent(resolved.username)}` }
			});
		const user = await getUserDetail({ username: resolved?.username ?? username });

		if (!user) {
			return textErrorResponse('用户不存在', 404);
		}

		if (user.isDisabled) {
			return textErrorResponse('该用户已被禁用', 404);
		}

		return textResponse(formatUserDetail(user));
	} catch (error) {
		console.error('获取用户详情失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
