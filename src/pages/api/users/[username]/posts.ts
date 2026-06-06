/**
 * 用户帖子列表 API
 *
 * GET /api/users/:username/posts — 获取用户帖子列表
 * 支持 q 参数搜索帖子内容，支持游标分页。
 * 只返回 public 且未删除的帖子（非作者只能看 public）。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 每页返回条数 */
const PAGE_SIZE = 20;

/**
 * 获取用户帖子列表
 *
 * 流程：
 * 1. 检查目标用户存在
 * 2. 获取当前登录用户（可选，用于判断可见性）
 * 3. 构建查询条件（搜索、可见性、分页）
 * 4. 返回帖子列表和分页信息
 *
 * @param context - Astro API 上下文
 * @returns 帖子列表和分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		const { username } = context.params;
		if (!username) {
			return jsonErrorResponse('用户名不能为空');
		}

		// 1. 检查目标用户存在
		const targetUser = await prisma.user.findUnique({
			where: { username },
			select: { id: true }
		});
		if (!targetUser) {
			return jsonErrorResponse('用户不存在', 404);
		}

		// 2. 获取当前登录用户（可选）
		const currentUser = await getUserFromRequest(context);
		const isAuthor = currentUser?.userId === targetUser.id;

		// 3. 解析查询参数
		const url = new URL(context.request.url);
		const q = url.searchParams.get('q')?.trim() || '';
		const cursor = url.searchParams.get('cursor');

		// 构建基础查询条件
		// 非作者只能看 public 且未删除的帖子
		const where: Record<string, unknown> = {
			userId: targetUser.id,
			isDeleted: false
		};

		// 非作者只能看 public 帖子
		if (!isAuthor) {
			where.visibility = 'public';
		}

		// 搜索条件：内容包含关键词（大小写不敏感）
		if (q) {
			where.content = { contains: q };
		}

		// 游标分页条件
		const cursorFilter = cursor
			? {
					createdAt: { lt: new Date(cursor) }
				}
			: {};

		// 4. 查询帖子：置顶优先，然后时间倒序
		const posts = await prisma.post.findMany({
			where: { ...where, ...cursorFilter },
			orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
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
				_count: {
					select: { likes: true }
				}
			}
		});

		// 判断是否有下一页
		const hasNextPage = posts.length > PAGE_SIZE;
		const items = hasNextPage ? posts.slice(0, PAGE_SIZE) : posts;

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
			}
		}));

		return new Response(
			JSON.stringify(
				successResponse({ items: formattedPosts, nextCursor, hasMore: hasNextPage })
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取用户帖子列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
