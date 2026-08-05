/**
 * Agent 个人记录 API
 *
 * GET /api/agent/note — 读取当前用户的个人记录（纯文本）
 * PUT /api/agent/note — 更新当前用户的个人记录
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { updateProfile, getUserNote } from '@/services/settings.service';
import { getErrorMessage, getErrorStatus, ServiceError } from '@/lib/errors';

/** ServiceError code → HTTP 状态码映射 */
const statusCodeMap: Record<string, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
	UNAUTHORIZED: 401
};

/** 个人记录最大长度 */
const NOTE_MAX_LENGTH = 2000;

/**
 * 读取个人记录
 *
 * 返回当前用户 note 字段的纯文本内容。
 * note 为空时返回空字符串。
 *
 * @param context - Astro API 上下文
 * @returns note 纯文本内容
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		// 通过 service 查询 note 字段
		const noteContent = await getUserNote({ userId: currentUser.userId });

		return textResponse(noteContent);
	} catch (error) {
		console.error('读取个人记录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};

/**
 * 更新个人记录
 *
 * 参数：note（字符串，最多 2000 字）
 * 空字符串为合法值（清空记录）。
 *
 * @param context - Astro API 上下文
 * @returns `ok` 或 `error: 原因`
 */
export const PUT: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { note } = body as { note?: string };

		// 仅当 note 传入时才更新，避免误清空已有记录
		if (note === undefined) {
			return textResponse('ok');
		}

		if (note.length > NOTE_MAX_LENGTH) {
			return textErrorResponse(`个人记录最多 ${NOTE_MAX_LENGTH} 字符`);
		}

		// 使用 settings.service 的 updateProfile 更新 note
		try {
			await updateProfile({
				userId: currentUser.userId,
				note
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
		console.error('更新个人记录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
