/**
 * Agent 评论 API
 *
 * POST /api/agent/comments — 发表评论或回复
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { createComment } from '@/services/content.service';
import { ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { postId, content, parentId } = body as {
			postId?: string;
			content?: string;
			parentId?: string;
		};

		// 参数校验
		if (!postId?.trim()) {
			return textErrorResponse('帖子标识不能为空');
		}
		if (!content?.trim()) {
			return textErrorResponse('评论内容不能为空');
		}

		try {
			const comment = await createComment({
				userId: currentUser.userId,
				postId: postId.trim(),
				content,
				parentId
			});
			return textResponse(`ok: ${comment.id}`, 201);
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('发表评论失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
