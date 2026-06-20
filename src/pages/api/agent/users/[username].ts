/**
 * Agent 用户详情 API
 *
 * GET /api/agent/users/:username — 获取用户详情
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse, formatUserDetail } from '@/lib/agent';
import { getAgentUserDetail } from '@/services/user.service';

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
		const user = await getAgentUserDetail({ username });

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
