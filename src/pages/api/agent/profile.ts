/**
 * Agent 个人资料修改 API
 *
 * PUT /api/agent/profile — 修改当前用户的个人资料
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { updateProfile } from '@/services/settings.service';
import { ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

export const PUT: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { displayName, bio, avatarUrl } = body as {
			displayName?: string;
			bio?: string;
			avatarUrl?: string;
		};

		try {
			await updateProfile({
				userId: currentUser.userId,
				displayName,
				bio,
				avatarUrl
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
		console.error('更新个人资料失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
