/**
 * Webhook 密钥查看 API
 *
 * GET /api/webhooks/:id/secret — 获取 Webhook 的明文 Secret
 *
 * 安全说明：
 * - 必须登录且是 Webhook 所属用户
 * - 返回明文 secret（仅此一次的机会，与创建时一致）
 * - 前端可弹窗展示并提示用户立即复制保存
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取 Webhook 的明文 Secret
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Webhook 是否存在并验证所属用户
 * 3. 返回明文 secret
 *
 * @param context - Astro API 上下文
 * @returns 明文 secret
 */
export const GET: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('Webhook ID 不能为空');
		}

		// 2. 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			return jsonErrorResponse('Webhook 不存在', 404);
		}

		// 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			return jsonErrorResponse('无权查看此 Webhook', 403);
		}

		// 3. 返回明文 secret
		return new Response(JSON.stringify(successResponse({ secret: webhook.secret })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取 Webhook Secret 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
