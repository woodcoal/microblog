/**
 * 管理后台 - 删除帖子 API
 *
 * DELETE /api/admin/posts/:id/delete — 删除帖子（软删除）
 * 需 admin 权限，需填写删除理由
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/**
 * 删除帖子（管理员操作，软删除）
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证帖子存在
 * 3. 验证删除理由（必填）
 * 4. 设置 isDeleted=true, deleteReason, deletedBy
 *
 * @param context - Astro API 上下文
 * @returns 操作结果
 */
export const DELETE: APIRoute = async (context) => {
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

		// 验证删除理由
		if (!reason || !reason.trim()) {
			return jsonErrorResponse('删除理由不能为空');
		}

		// 验证帖子存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 已删除
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已被删除');
		}

		// 软删除帖子
		await prisma.post.update({
			where: { id },
			data: {
				isDeleted: true,
				deleteReason: reason.trim(),
				deletedBy: admin.userId
			}
		});

		return new Response(JSON.stringify(successResponse({ id, isDeleted: true })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('删除帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
