/**
 * 管理后台 - 恢复帖子 API
 *
 * PUT /api/admin/posts/:id/restore — 恢复已删除的帖子
 * 需 admin 权限，需填写恢复理由
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/**
 * 恢复帖子
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证帖子存在且已删除
 * 3. 验证恢复理由（必填）
 * 4. 设置 isDeleted=false, restoreReason, restoredBy
 *
 * @param context - Astro API 上下文
 * @returns 操作结果
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { reason } = body as { reason?: string };

		// 验证恢复理由
		if (!reason || !reason.trim()) {
			return jsonErrorResponse('恢复理由不能为空');
		}

		// 验证帖子存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 未被删除
		if (!post.isDeleted) {
			return jsonErrorResponse('帖子未被删除');
		}

		// 恢复帖子
		await prisma.post.update({
			where: { id },
			data: {
				isDeleted: false,
				restoreReason: reason.trim(),
				restoredBy: admin.userId
			}
		});

		return new Response(JSON.stringify(successResponse({ id, isDeleted: false })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('恢复帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
