/**
 * 搜索建议 API（自动补全）
 *
 * GET /api/search/suggest?q=xxx — 根据关键词前缀返回匹配的标签、用户和分类
 * 用于搜索框的自动补全功能，返回最多 5 个标签、5 个用户和 5 个分类。
 * 标签按帖子数降序排列，用户按粉丝数降序排列，分类按 mode 分组。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 每类返回的最大条数 */
const MAX_SUGGESTIONS = 5;

/**
 * 搜索建议接口
 *
 * 流程：
 * 1. 解析查询参数 q
 * 2. q 为空或少于 1 字符时返回空数组
 * 3. 并行查询匹配的标签、用户和分类
 * 4. 返回格式化后的建议结果
 *
 * @param context - Astro API 上下文
 * @returns 标签、用户和分类的搜索建议
 */
export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const q = url.searchParams.get('q')?.trim() || '';

		// q 为空或少于 1 字符时返回空数组
		if (q.length < 1) {
			return new Response(
				JSON.stringify(successResponse({ tags: [], users: [], categories: [] })),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// 并行查询标签、用户和分类
		const [tags, users, categories] = await Promise.all([
			// 查询标签：名称包含关键词、未隐藏、按帖子数降序、最多 5 条
			prisma.tag.findMany({
				where: {
					name: { contains: q },
					isHidden: false
				},
				orderBy: { posts: { _count: 'desc' } },
				take: MAX_SUGGESTIONS,
				select: {
					id: true,
					name: true,
					_count: {
						select: { posts: true }
					}
				}
			}),

			// 查询用户：用户名或显示名包含关键词、未禁用、按粉丝数降序、最多 5 条
			prisma.user.findMany({
				where: {
					isDisabled: false,
					OR: [{ username: { contains: q } }, { displayName: { contains: q } }]
				},
				orderBy: { followers: { _count: 'desc' } },
				take: MAX_SUGGESTIONS,
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}),

			// 查询分类：名称包含关键词、按 mode 分组、最多 5 条
			prisma.category.findMany({
				where: {
					name: { contains: q }
				},
				orderBy: [{ mode: 'asc' }, { sortOrder: 'asc' }],
				take: MAX_SUGGESTIONS,
				select: {
					id: true,
					name: true,
					slug: true,
					mode: true,
					icon: true,
					parentId: true
				}
			})
		]);

		// 格式化标签数据：将 _count.posts 映射为 postCount
		const formattedTags = tags.map((tag) => ({
			id: tag.id,
			name: tag.name,
			postCount: tag._count.posts
		}));

		return new Response(
			JSON.stringify(successResponse({ tags: formattedTags, users, categories })),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('搜索建议查询失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
