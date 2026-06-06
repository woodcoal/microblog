/**
 * 管理后台 - 评论列表 API
 *
 * GET /api/admin/comments — 获取评论列表（支持分页）
 * 需 admin 权限
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取评论列表
 *
 * 支持参数：
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20，最大 100）
 *
 * @param context - Astro API 上下文
 * @returns 评论列表和总数
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		const url = new URL(context.request.url);
		const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
		const skip = (page - 1) * limit;

		// 并行查询列表和总数
		const [comments, total] = await Promise.all([
			prisma.comment.findMany({
				select: {
					id: true,
					content: true,
					isDeleted: true,
					createdAt: true,
					user: {
						select: {
							id: true,
							username: true,
							displayName: true
						}
					},
					post: {
						select: {
							id: true,
							content: true
						}
					}
				},
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit
			}),
			prisma.comment.count()
		]);

		return new Response(JSON.stringify(successResponse({ comments, total, page, limit })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取评论列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
