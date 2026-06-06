/**
 * 管理后台 - 删除评论 API
 *
 * DELETE /api/admin/comments/:id/delete — 删除评论（软删除）
 * 需 admin 权限
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 删除评论（管理员操作，软删除）
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证评论存在
 * 3. 设置 isDeleted = true
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
			return jsonErrorResponse('评论 ID 不能为空');
		}

		// 验证评论存在
		const comment = await prisma.comment.findUnique({ where: { id } });
		if (!comment) {
			return jsonErrorResponse('评论不存在', 404);
		}

		// 已删除
		if (comment.isDeleted) {
			return jsonErrorResponse('评论已被删除');
		}

		// 软删除
		await prisma.comment.update({
			where: { id },
			data: { isDeleted: true }
		});

		return new Response(JSON.stringify(successResponse({ id, isDeleted: true })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除评论失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
