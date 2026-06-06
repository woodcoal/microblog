/**
 * 全局搜索用户 API
 *
 * GET /api/search/users — 搜索用户
 * 使用 LIKE（Prisma contains）查询搜索用户名和显示名，
 * 不搜索被禁用的用户，包含粉丝数、关注数、发帖数。
 * 支持游标分页。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 每页返回条数 */
const PAGE_SIZE = 20;

/**
 * 搜索用户
 *
 * 流程：
 * 1. 解析查询参数（q、cursor、limit）
 * 2. q 为空时返回空列表
 * 3. 构建查询条件（未禁用、用户名或显示名包含关键词）
 * 4. 执行查询并返回结果和分页信息
 *
 * @param context - Astro API 上下文
 * @returns 用户搜索结果和分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const q = url.searchParams.get('q')?.trim() || '';
		const cursor = url.searchParams.get('cursor');
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : PAGE_SIZE;

		// q 为空时返回空列表
		if (!q) {
			return new Response(
				JSON.stringify(successResponse({ items: [], nextCursor: null, hasMore: false })),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// 构建查询条件：未禁用、用户名或显示名包含关键词
		const where: Record<string, unknown> = {
			isDisabled: false,
			OR: [{ username: { contains: q } }, { displayName: { contains: q } }]
		};

		// 游标分页条件：按创建时间倒序
		const cursorFilter = cursor
			? {
					createdAt: { lt: new Date(cursor) }
				}
			: {};

		// 查询用户
		const users = await prisma.user.findMany({
			where: { ...where, ...cursorFilter },
			orderBy: [{ createdAt: 'desc' }],
			take: limit + 1,
			select: {
				id: true,
				username: true,
				displayName: true,
				avatarUrl: true,
				bio: true,
				createdAt: true,
				_count: {
					select: {
						followers: true,
						following: true,
						posts: {
							where: { isDeleted: false, visibility: 'public' }
						}
					}
				}
			}
		});

		// 判断是否有下一页
		const hasNextPage = users.length > limit;
		const items = hasNextPage ? users.slice(0, limit) : users;

		// 下一页游标
		const nextCursor = hasNextPage ? items[items.length - 1].createdAt.toISOString() : null;

		// 格式化返回数据
		const formattedUsers = items.map((user) => ({
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl,
			bio: user.bio,
			followerCount: user._count.followers,
			followingCount: user._count.following,
			postCount: user._count.posts
		}));

		return new Response(
			JSON.stringify(
				successResponse({ items: formattedUsers, nextCursor, hasMore: hasNextPage })
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('搜索用户失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
