/**
 * 评论排序偏好 API
 *
 * PUT /api/settings/comment-sort — 更新评论排序偏好
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/**
 * 更新评论排序偏好
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 校验排序值合法性
 * 3. 更新或创建 UserSettings 记录
 * 4. 返回当前排序偏好
 *
 * @param context - Astro API 上下文
 * @returns { order: string } 或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { order } = body as { order?: string };

		// 2. 校验排序值
		if (order !== 'asc' && order !== 'desc') {
			return jsonErrorResponse('排序值必须为 asc 或 desc');
		}

		// 3. 更新或创建 UserSettings 记录
		await prisma.userSettings.upsert({
			where: { userId: currentUser.userId },
			update: { commentSortOrder: order },
			create: {
				userId: currentUser.userId,
				commentSortOrder: order
			}
		});

		// 4. 返回当前排序偏好
		return new Response(JSON.stringify(successResponse({ order })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('更新评论排序偏好失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
