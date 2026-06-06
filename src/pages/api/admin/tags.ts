/**
 * 管理后台 - 标签列表 API
 *
 * GET /api/admin/tags — 获取标签列表（含使用次数，支持分页）
 * 需 admin 权限
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取标签列表
 *
 * 支持参数：
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20，最大 100）
 *
 * 返回标签列表及每个标签的使用次数。
 *
 * @param context - Astro API 上下文
 * @returns 标签列表和总数
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
		const [tags, total] = await Promise.all([
			prisma.tag.findMany({
				select: {
					id: true,
					name: true,
					isHidden: true,
					createdAt: true,
					// 统计使用次数
					_count: {
						select: { posts: true }
					}
				},
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit
			}),
			prisma.tag.count()
		]);

		// 转换为前端需要的格式
		const tagList = tags.map((tag) => ({
			id: tag.id,
			name: tag.name,
			isHidden: tag.isHidden,
			createdAt: tag.createdAt,
			usageCount: tag._count.posts
		}));

		return new Response(
			JSON.stringify(successResponse({ tags: tagList, total, page, limit })),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取标签列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
