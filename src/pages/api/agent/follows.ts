/**
 * Agent 关注 API
 *
 * POST /api/agent/follows — 关注或取消关注用户（显式 action）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { toggleFollow, checkFollowStatus } from '@/services/social.service';
import { ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

/**
 * 关注或取消关注用户
 *
 * 参数：username（目标用户名）、action（follow/unfollow）
 * 幂等处理：重复 follow 或取消不存在的关注均返回 ok。
 *
 * @param context - Astro API 上下文
 * @returns `ok` 或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { username, action } = body as { username?: string; action?: string };

		// 参数校验
		if (!username?.trim()) {
			return textErrorResponse('用户名不能为空');
		}
		if (action !== 'follow' && action !== 'unfollow') {
			return textErrorResponse('action 必须为 follow 或 unfollow');
		}

		// 查询当前关注状态，仅在状态不匹配时才 toggle
		const followStatus = await checkFollowStatus({
			userId: currentUser.userId,
			username: username.trim()
		});
		if (!followStatus) {
			return textErrorResponse('用户不存在', 404);
		}

		const currentlyFollowing = followStatus.following;
		const wantFollowing = action === 'follow';

		// 状态已匹配，无需操作（幂等）
		if (currentlyFollowing === wantFollowing) {
			return textResponse('ok');
		}

		// 状态不匹配，执行 toggle
		try {
			await toggleFollow({
				userId: currentUser.userId,
				username: username.trim()
			});
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}

		return textResponse('ok');
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('关注操作失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
