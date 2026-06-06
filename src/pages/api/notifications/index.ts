/**
 * 通知列表 API
 *
 * GET /api/notifications — 获取当前用户的通知列表
 * DELETE /api/notifications — 删除当前用户的所有通知
 *
 * GET 支持游标分页，每页 20 条，按时间倒序排列。
 * 支持 type 查询参数筛选通知类型（follow, comment, like, mention）。
 * 每条通知包含触发者（actor）的用户信息。
 * 需要登录认证。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 每页通知数量 */
const PAGE_SIZE = 20;

/** 合法的通知类型筛选值 */
const VALID_TYPES = ['follow', 'comment', 'like', 'mention'];

/**
 * 获取通知列表
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 解析游标和类型筛选参数
 * 3. 查询通知列表，包含 actor 用户信息
 * 4. 计算下一页游标
 * 5. 返回通知列表和游标
 *
 * @param context - Astro API 上下文
 * @returns { notifications: [...], nextCursor: string | null } 或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 解析游标和类型筛选参数
		const url = new URL(context.request.url);
		const cursor = url.searchParams.get('cursor') || undefined;
		const typeFilter = url.searchParams.get('type') || undefined;

		// 验证类型筛选参数合法性
		if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
			return jsonErrorResponse('无效的通知类型筛选');
		}

		// 3. 构建查询条件
		const where: any = { recipientId: currentUser.userId };
		if (typeFilter) {
			where.type = typeFilter;
		}

		// 4. 查询通知列表
		const notifications = await prisma.notification.findMany({
			where,
			include: {
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
			take: PAGE_SIZE + 1,
			...(cursor && {
				cursor: { id: cursor },
				skip: 1
			})
		});

		// 5. 判断是否有下一页，截取实际返回数量
		const hasNextPage = notifications.length > PAGE_SIZE;
		const items = hasNextPage ? notifications.slice(0, PAGE_SIZE) : notifications;
		const nextCursor = hasNextPage ? items[items.length - 1].id : null;

		// 6. 批量查询帖子作者用户名（用于构建帖子链接）
		const postIds = [...new Set(items.map((n) => n.postId).filter(Boolean))] as string[];
		const postAuthorMap = new Map<string, string>();
		if (postIds.length > 0) {
			const posts = await prisma.post.findMany({
				where: { id: { in: postIds } },
				select: {
					id: true,
					user: { select: { username: true } }
				}
			});
			for (const p of posts) {
				postAuthorMap.set(p.id, p.user.username);
			}
		}

		// 7. 为每条通知附加 postAuthorUsername
		const itemsWithAuthor = items.map((n: any) => ({
			...n,
			postAuthorUsername: n.postId ? (postAuthorMap.get(n.postId) ?? null) : null
		}));

		return new Response(
			JSON.stringify(
				successResponse({
					items: itemsWithAuthor,
					nextCursor,
					hasMore: hasNextPage
				})
			),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('获取通知列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 删除全部通知
 *
 * DELETE /api/notifications — 删除当前用户的所有通知
 * 只删除 recipientId 为当前用户的通知。
 *
 * @param context - Astro API 上下文
 * @returns { deletedCount: number } 或错误
 */
export const DELETE: APIRoute = async (context) => {
	try {
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 删除当前用户收到的所有通知
		const result = await prisma.notification.deleteMany({
			where: { recipientId: currentUser.userId }
		});

		return new Response(JSON.stringify(successResponse({ deletedCount: result.count })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除全部通知失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
