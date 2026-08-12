/**
 * Agent 快速注册 API
 *
 * POST /api/agent/register — 注册新用户并自动创建 API Token
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { registerUser } from '@/services/auth.service';
import { createToken } from '@/services/token.service';
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
		let user;
		try {
			user = await registerUser({ username, displayName, email, password });
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}

		// 通过 service 创建 API Token
		const tokenResult = await createToken({
			userId: user.id,
			name: 'agent-auto'
		});

		return textResponse(`ok: ${tokenResult.token}`, 201);
	} catch (error) {
		if (getErrorStatus(error) === 400) {
			return textErrorResponse(getErrorMessage(error, '请求参数错误'), 400);
		}
		console.error('快速注册失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
