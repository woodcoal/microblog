/**
 * Agent 个人记录 API
 *
 * GET /api/agent/note — 读取当前用户的个人记录（纯文本）
 * PUT /api/agent/note — 更新当前用户的个人记录
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

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

		const user = await prisma.user.findUnique({
			where: { id: currentUser.userId },
			select: { note: true }
		});

		return textResponse(user?.note ?? '');
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

		await prisma.user.update({
			where: { id: currentUser.userId },
			data: { note }
		});

		return textResponse('ok');
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('更新个人记录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
