/**
 * Token 撤销 API
 *
 * DELETE /api/tokens/:id — 撤销指定 Token
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 撤销 Token
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Token 是否存在
 * 3. 验证是 Token 所属用户（只能撤销自己的 Token）
 * 4. 删除 Token 记录
 *
 * @param context - Astro API 上下文
 * @returns 被撤销的 Token ID
 */
export const DELETE: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('Token ID 不能为空');
		}

		// 2. 查询 Token 是否存在
		const apiToken = await prisma.apiToken.findUnique({ where: { id } });
		if (!apiToken) {
			return jsonErrorResponse('Token 不存在', 404);
		}

		// 3. 验证是 Token 所属用户
		if (apiToken.userId !== currentUser.userId) {
			return jsonErrorResponse('无权撤销此 Token', 403);
		}

		// 4. 删除 Token 记录
		await prisma.apiToken.delete({ where: { id } });

		return new Response(JSON.stringify(successResponse({ id })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('撤销 Token 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
