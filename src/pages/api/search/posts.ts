/**
 * 全局搜索帖子 API
 *
 * GET /api/search/posts — 搜索帖子
 * 使用 LIKE（Prisma contains）查询搜索帖子内容，
 * 只搜索 public 且未删除的帖子，支持游标分页。
 * 包含用户信息、标签、点赞数。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 每页返回条数 */
const PAGE_SIZE = 20;

/**
 * 搜索帖子
 *
 * 流程：
 * 1. 解析查询参数（q、cursor、limit）
 * 2. q 为空时返回空列表
 * 3. 构建查询条件（公开、未删除、内容包含关键词）
 * 4. 执行查询并返回结果和分页信息
 *
 * @param context - Astro API 上下文
 * @returns 帖子搜索结果和分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		const q = url.searchParams.get('q')?.trim() || '';
		const cursor = url.searchParams.get('cursor');
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : PAGE_SIZE;
		// 排序方式：latest=按时间倒序（默认），popular=按点赞数倒序再按时间倒序
		const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'latest';

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

		// 构建查询条件：公开、未删除、内容包含关键词
		const where: Record<string, unknown> = {
			visibility: 'public',
			isDeleted: false,
			content: { contains: q }
		};

		// 游标分页条件：按创建时间倒序
		const cursorFilter = cursor
			? {
					createdAt: { lt: new Date(cursor) }
				}
			: {};

		// 根据排序方式决定排序规则
		const orderBy =
			sort === 'popular'
				? [{ likes: { _count: 'desc' as const } }, { createdAt: 'desc' as const }]
				: [{ createdAt: 'desc' as const }];

		// 查询帖子
		const posts = await prisma.post.findMany({
			where: { ...where, ...cursorFilter },
			orderBy,
			take: limit + 1,
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
					}
				},
				tags: {
					include: {
						tag: {
							select: {
								id: true,
								name: true
							}
						}
					}
				},
				_count: {
					select: { likes: true }
				}
			}
		});

		// 判断是否有下一页
		const hasNextPage = posts.length > limit;
		const items = hasNextPage ? posts.slice(0, limit) : posts;

		// 下一页游标
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
			},
			tags: post.tags.map((pt) => ({
				id: pt.tag.id,
				name: pt.tag.name
			}))
		}));

		return new Response(
			JSON.stringify(
				successResponse({ items: formattedPosts, nextCursor, hasMore: hasNextPage })
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('搜索帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
