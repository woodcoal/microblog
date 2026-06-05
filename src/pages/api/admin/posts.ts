/**
 * 管理后台 - 帖子列表 API
 *
 * GET /api/admin/posts — 获取帖子列表（含已删除，支持搜索和分页）
 * 需 admin 权限
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取帖子列表（管理后台，含已删除帖子）
 *
 * 支持参数：
 * - search: 按内容搜索
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20，最大 100）
 *
 * @param context - Astro API 上下文
 * @returns 帖子列表和总数
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		const url = new URL(context.request.url);
		const search = url.searchParams.get('search') || '';
		const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
		const skip = (page - 1) * limit;

		// 构建查询条件（管理后台包含已删除帖子）
		const where = search ? { content: { contains: search } } : {};

		// 并行查询列表和总数
		const [posts, total] = await Promise.all([
			prisma.post.findMany({
				where,
				select: {
					id: true,
					content: true,
					visibility: true,
					isPinned: true,
					isGlobalPinned: true,
					isLocked: true,
					lockReason: true,
					isDeleted: true,
					deleteReason: true,
					isEdited: true,
					createdAt: true,
					user: {
						select: {
							id: true,
							username: true,
							displayName: true
						}
					}
				},
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit
			}),
			prisma.post.count({ where })
		]);

		return new Response(JSON.stringify(successResponse({ posts, total, page, limit })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取帖子列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
