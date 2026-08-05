/**
 * Agent 点赞 API
 *
 * POST /api/agent/likes — 点赞或取消点赞帖子（显式 action）
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { toggleLike as toggleLikeService, checkLikeStatus } from '@/services/social.service';
import { getErrorMessage, getErrorStatus, ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

/**
 * 点赞或取消点赞帖子
 *
 * 参数：postId（帖子标识）、action（like/unlike）
 * 幂等处理：重复 like 或取消不存在的点赞均返回 ok。
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { postId, action } = body as { postId?: string; action?: string };

		// 参数校验
		if (!postId?.trim()) {
			return textErrorResponse('帖子标识不能为空');
		}
		if (action !== 'like' && action !== 'unlike') {
			return textErrorResponse('action 必须为 like 或 unlike');
		}

		// 查询当前点赞状态，仅在状态不匹配时才 toggle
		const currentlyLiked = await checkLikeStatus({
			userId: currentUser.userId,
			postId: postId.trim()
		});
		const wantLiked = action === 'like';

		// 状态已匹配，无需操作（幂等）
		if (currentlyLiked === wantLiked) {
			return textResponse('ok');
		}

		// 状态不匹配，执行 toggle
		try {
			await toggleLikeService({
				userId: currentUser.userId,
				targetId: postId.trim(),
				type: 'post'
			});
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}

		return textResponse('ok');
	} catch (error) {
		if (getErrorStatus(error) === 400) {
			return textErrorResponse(getErrorMessage(error, '请求参数错误'), 400);
		}
		console.error('点赞操作失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
