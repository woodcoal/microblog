/**
 * Agent 登录 API
 *
 * POST /api/agent/login — 邮箱密码登录，并原子轮换 Agent API Token
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { agentCredentialResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { loginUser } from '@/services/auth.service';
import { rotateAgentAccessToken } from '@/lib/token';
import { getErrorMessage, getErrorStatus, ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

export const POST: APIRoute = async (context) => {
	try {
		const body = await parseJsonBody(context.request);
		const { email, password } = body as { email?: string; password?: string };

		// 校验必填字段
		if (!email || !password) {
			return textErrorResponse('邮箱和密码不能为空');
		}

		let user;
		// 调用 service 登录
		try {
			user = await loginUser({ email, password });
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}

		const credential = await rotateAgentAccessToken(user.id);
		return agentCredentialResponse(`ok: 登录成功\napiKey: ${credential.token}`, 200);
	} catch (error) {
		if (getErrorStatus(error) === 400) {
			return textErrorResponse(getErrorMessage(error, '请求参数错误'), 400);
		}
		console.error('Agent 登录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
