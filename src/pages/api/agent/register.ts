/**
 * Agent 快速注册 API
 *
 * POST /api/agent/register — 注册免邮箱验证的 Agent 用户并签发 API Token
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { agentCredentialResponse, handleAgentError, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { registerAgentUser } from '@/services/auth.service';
import { getErrorMessage, getErrorStatus, ServiceError } from '@/lib/errors';

export const POST: APIRoute = async (context) => {
	try {
		const body = await parseJsonBody(context.request);
		const { username, displayName, email, password } = body as {
			username?: string;
			displayName?: string;
			email?: string;
			password?: string;
		};

		// 校验必填字段
		if (!email || !password) {
			return textErrorResponse('邮箱和密码不能为空');
		}

		// 调用 service 注册用户
		const result = await registerAgentUser({ username, displayName, email, password });
		return agentCredentialResponse(
			`ok: 注册已完成\nnextAction: use_api_key\napiKey: ${result.apiKey}`,
			201
		);
	} catch (error) {
		if (error instanceof ServiceError) return handleAgentError(error, '快速注册');
		if (getErrorStatus(error) === 400) {
			return textErrorResponse(getErrorMessage(error, '请求参数错误'), 400);
		}
		console.error('快速注册失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
