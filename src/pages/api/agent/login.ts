/**
 * Agent 登录 API
 *
 * POST /api/agent/login — 邮箱密码登录，返回 API Token（如存在）
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { loginUser, getUserApiTokenCount } from '@/services/auth.service';
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

		// 调用 service 登录
		try {
			await loginUser({ email, password });
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message, statusCodeMap[e.code] || 400);
			}
			throw e;
		}

		// 查询用户的 API Token
		// 由于 tokenHash 是哈希存储，无法还原明文，
		// 所以只能告知用户是否有可用 Token，让用户自行获取。
		const tokenInfo = await getUserApiTokenCount({ email });

		if (!tokenInfo || tokenInfo.tokenCount === 0) {
			return textErrorResponse(
				'该用户无可用 Token，请先通过 /api/agent/register 注册或前往设置创建 API Token',
				404
			);
		}

		// 有 Token 但无法返回明文（哈希存储），提示用户
		return textResponse(
			`ok: 该用户已有 ${tokenInfo.tokenCount} 个 API Token，但 Token 明文仅在创建时返回一次。请使用已保存的 Token，或通过 /api/tokens 创建新 Token`
		);
	} catch (error) {
		if (getErrorStatus(error) === 400) {
			return textErrorResponse(getErrorMessage(error, '请求参数错误'), 400);
		}
		console.error('Agent 登录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
