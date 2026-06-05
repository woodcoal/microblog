/**
 * 关注时间线 API
 *
 * GET /api/timeline/following — 获取关注用户的帖子时间线
 * 需要登录认证，按时间倒序，支持游标分页。
 * 返回 public + followers + logged_in 且未删除的帖子。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { getFollowingTimelineFilter } from '@/lib/visibility';

/** 每页返回条数 */
const PAGE_SIZE = 20;

/**
 * 获取关注时间线
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 获取当前用户关注的所有用户 ID
 * 3. 查询这些用户的帖子（public、未删除、时间倒序）
 * 4. 支持游标分页（cursor = 上一页最后一条帖子的 createdAt）
 *
 * @param context - Astro API 上下文
 * @returns 帖子列表和分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 获取当前用户关注的所有用户 ID
		const follows = await prisma.follow.findMany({
			where: { followerId: currentUser.userId },
			select: { followingId: true }
		});
		const followingIds = follows.map((f) => f.followingId);

		// 没有关注任何人，仅返回自己的帖子
		if (followingIds.length === 0) {
			const ownPosts = await prisma.post.findMany({
				where: {
					userId: currentUser.userId,
					visibility: { in: ['public', 'followers', 'logged_in'] },
					isDeleted: false
				},
				orderBy: { createdAt: 'desc' },
				take: 21,
				include: {
					user: {
						select: {
							id: true,
							username: true,
							displayName: true,
							avatarUrl: true
						}
					},
					_count: {
						select: { likes: true }
					}
				}
			});
			const hasMore = ownPosts.length > 20;
			const posts = hasMore ? ownPosts.slice(0, 20) : ownPosts;
			const nextCursor = hasMore ? posts[posts.length - 1].createdAt.toISOString() : null;

			return new Response(
				JSON.stringify(successResponse({ items: posts, nextCursor, hasMore })),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// 3. 解析分页参数
		const url = new URL(context.request.url);
		const cursor = url.searchParams.get('cursor');

		// 构建查询条件：关注用户 + 自己的帖子，可见度过滤，未删除
		const visibilityFilter = getFollowingTimelineFilter(currentUser.userId, followingIds);
		const where = {
			...visibilityFilter,
			isDeleted: false
		};

		// 游标分页：cursor 之后的记录（时间更早的）
		const cursorFilter = cursor
			? {
					createdAt: { lt: new Date(cursor) }
				}
			: {};

		// 多取一条用于判断是否有下一页
		const posts = await prisma.post.findMany({
			where: { ...where, ...cursorFilter },
			orderBy: { createdAt: 'desc' },
			take: PAGE_SIZE + 1,
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
					}
				},
				// 统计每条帖子的点赞数
				_count: {
					select: { likes: true }
				}
			}
		});

		// 判断是否有下一页
		const hasNextPage = posts.length > PAGE_SIZE;
		const items = hasNextPage ? posts.slice(0, PAGE_SIZE) : posts;

		// 下一页游标 = 最后一条帖子的 createdAt
		const nextCursor = hasNextPage ? items[items.length - 1].createdAt.toISOString() : null;

		// 格式化返回数据
		const formattedPosts = items.map((post) => ({
			id: post.id,
			content: post.content,
			createdAt: post.createdAt.toISOString(),
			isPinned: post.isPinned,
			isGlobalPinned: post.isGlobalPinned,
			likeCount: post._count.likes,
			user: {
				id: post.user.id,
				username: post.user.username,
				displayName: post.user.displayName,
				avatarUrl: post.user.avatarUrl
			}
		}));

		return new Response(
			JSON.stringify(
				successResponse({ items: formattedPosts, nextCursor, hasMore: hasNextPage })
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取关注时间线失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
