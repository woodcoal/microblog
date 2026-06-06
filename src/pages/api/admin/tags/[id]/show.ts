/**
 * 管理后台 - 显示标签 API
 *
 * PUT /api/admin/tags/:id/show — 显示标签（取消隐藏）
 * 需 admin 权限
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 显示标签（取消隐藏）
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证标签存在
 * 3. 设置 isHidden = false
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
			return jsonErrorResponse('标签 ID 不能为空');
		}

		// 验证标签存在
		const tag = await prisma.tag.findUnique({ where: { id } });
		if (!tag) {
			return jsonErrorResponse('标签不存在', 404);
		}

		// 未隐藏
		if (!tag.isHidden) {
			return jsonErrorResponse('标签未被隐藏');
		}

		// 显示标签
		await prisma.tag.update({
			where: { id },
			data: { isHidden: false }
		});

		return new Response(JSON.stringify(successResponse({ id, isHidden: false })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('显示标签失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
