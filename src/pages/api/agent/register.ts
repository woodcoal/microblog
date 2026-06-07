/**
 * Agent 快速注册 API
 *
 * POST /api/agent/register — 注册新用户并自动创建 API Token
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { generateApiToken, hashToken } from '@/lib/token';
import { textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { registerUser } from '@/services/auth.service';
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
		const body = await parseJsonBody(context.request);
		const { username, displayName, email, password } = body as {
			username?: string;
			displayName?: string;
			email?: string;
			password?: string;
		};

		// 校验必填字段
		if (!username || !email || !password) {
			return textErrorResponse('用户名、邮箱和密码不能为空');
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

		// 生成 API Token
		const token = generateApiToken();
		const tokenHash = await hashToken(token);

		await prisma.apiToken.create({
			data: {
				userId: user.id,
				name: 'agent-auto',
				tokenHash
			}
		});

		return textResponse(`ok: ${token}`, 201);
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('快速注册失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
