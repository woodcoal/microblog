/**
 * 浏览反馈 API
 *
 * 记录用户浏览帖子的行为到 Gorse 推荐引擎。
 * 浏览反馈（read）用于去重：已看过的帖子不再推荐。
 * 需要登录认证。Gorse 未配置时静默跳过。
 */
import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { insertFeedback, isGorseEnabled, FEEDBACK_TYPE_READ } from '@/lib/gorse';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

export const POST: APIRoute = async ({ request }) => {
	// 1. 验证登录状态
	const currentUser = await getUserFromRequest({ request } as any);
	if (!currentUser) {
		return jsonErrorResponse('请先登录', 401);
	}

	// 2. Gorse 未启用时静默返回成功
	if (!isGorseEnabled()) {
		return new Response(JSON.stringify(successResponse({ recorded: false })), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 3. 解析请求体
	let body: { postId?: string };
	try {
		body = await request.json();
	} catch {
		return jsonErrorResponse('请求体 JSON 格式错误');
	}

	const { postId } = body;
	if (!postId) {
		return jsonErrorResponse('帖子 ID 不能为空');
	}

	// 4. 异步插入浏览反馈（不等待结果，直接返回成功）
	insertFeedback(currentUser.userId, postId, FEEDBACK_TYPE_READ, new Date().toISOString()).catch(
		() => {}
	);

	return new Response(JSON.stringify(successResponse({ recorded: true })), {
		headers: { 'Content-Type': 'application/json' }
	});
};
