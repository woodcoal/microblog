/**
 * 管理后台 - 操作记录列表 API
 *
 * GET /api/admin/activity-logs — 获取操作记录列表（支持分页和筛选）
 * 需 admin 权限
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取操作记录列表
 *
 * 支持参数：
 * - action: 按操作类型筛选（可选）
 * - actorId: 按操作者筛选（可选）
 * - targetType: 按目标类型筛选（可选）
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20，最大 100）
 *
 * @param context - Astro API 上下文
 * @returns 操作记录列表、总数、页码和总页数
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		const url = new URL(context.request.url);

		// 解析分页参数
		const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
		const skip = (page - 1) * limit;

		// 解析筛选参数
		const action = url.searchParams.get('action') || undefined;
		const actorId = url.searchParams.get('actorId') || undefined;
		const targetType = url.searchParams.get('targetType') || undefined;

		// 构建 where 条件：仅添加有值的筛选字段
		const where: Record<string, unknown> = {};
		if (action) where.action = action;
		if (actorId) where.actorId = actorId;
		if (targetType) where.targetType = targetType;

		// 并行查询列表和总数
		const [logs, total] = await Promise.all([
			prisma.activityLog.findMany({
				where,
				select: {
					id: true,
					action: true,
					targetType: true,
					targetId: true,
					targetUserId: true,
					postId: true,
					createdAt: true,
					// 关联查询操作者基本信息
					actor: {
						select: {
							id: true,
							username: true,
							displayName: true,
							avatarUrl: true
						}
					}
				},
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit
			}),
			prisma.activityLog.count({ where })
		]);

		// 计算总页数
		const totalPages = Math.ceil(total / limit);

		return new Response(JSON.stringify(successResponse({ logs, total, page, totalPages })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取操作记录列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
