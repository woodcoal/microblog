/**
 * 管理后台 - 禁用用户 API
 *
 * PUT /api/admin/users/:id/disable — 禁用用户
 * 需 admin 权限，不能禁用自己
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 禁用用户
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 不能禁用自己
 * 3. 验证目标用户存在
 * 4. 设置 isDisabled = true
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
			return jsonErrorResponse('用户 ID 不能为空');
		}

		// 不能禁用自己
		if (id === admin.userId) {
			return jsonErrorResponse('不能禁用自己');
		}

		// 验证目标用户存在
		const user = await prisma.user.findUnique({ where: { id } });
		if (!user) {
			return jsonErrorResponse('用户不存在', 404);
		}

		// 已禁用
		if (user.isDisabled) {
			return jsonErrorResponse('用户已被禁用');
		}

		// 禁用用户
		await prisma.user.update({
			where: { id },
			data: { isDisabled: true }
		});

		return new Response(JSON.stringify(successResponse({ id, isDisabled: true })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('禁用用户失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
