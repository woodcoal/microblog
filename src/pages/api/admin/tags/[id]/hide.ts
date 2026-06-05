/**
 * 管理后台 - 隐藏标签 API
 *
 * PUT /api/admin/tags/:id/hide — 隐藏标签
 * 需 admin 权限
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 隐藏标签
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证标签存在
 * 3. 设置 isHidden = true
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

		// 已隐藏
		if (tag.isHidden) {
			return jsonErrorResponse('标签已被隐藏');
		}

		// 隐藏标签
		await prisma.tag.update({
			where: { id },
			data: { isHidden: true }
		});

		return new Response(JSON.stringify(successResponse({ id, isHidden: true })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('隐藏标签失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
