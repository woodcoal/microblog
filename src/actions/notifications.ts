/**
 * 通知 Actions
 *
 * 提供通知查询、删除、标记已读等服务端 Actions。
 * 替代传统 REST API 路由，使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUnreadCount, markNotificationsRead } from '@/lib/notification';

/** 每页通知数量 */
const PAGE_SIZE = 20;

/** 合法的通知类型筛选值 */
const VALID_TYPES = ['follow', 'comment', 'like', 'mention'];

/**
 * 获取未读通知数量 Action
 *
 * 检查用户通知开关，关闭则返回 0，否则查询未读通知数量。
 * 需要登录认证。
 *
 * @param input - 无
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { count: number } 未读通知数量
 */
const getUnreadCountAction = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		// 检查通知开关
		const settings = await prisma.userSettings.findUnique({
			where: { userId: currentUser.userId },
			select: { notificationsEnabled: true }
		});
		if (settings && !settings.notificationsEnabled) {
			return { count: 0 };
		}

		// 查询未读数量
		const count = await getUnreadCount(currentUser.userId);

		return { count };
	}
});

/**
 * 获取通知列表 Action
 *
 * 游标分页，每页 20 条，按时间倒序排列。
 * 支持 type 筛选通知类型。
 * 每条通知包含触发者（actor）的用户信息和帖子作者用户名。
 * 需要登录认证。
 *
 * @param input - { cursor?: 游标, type?: 通知类型筛选 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { items, nextCursor, hasMore } 通知列表和分页信息
 */
const getNotifications = defineAction({
	input: z.object({
		cursor: z.string().optional(),
		type: z.string().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { cursor, type } = input;

		// 验证类型筛选参数合法性
		if (type && !VALID_TYPES.includes(type)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的通知类型筛选' });
		}

		// 构建查询条件
		const where: any = { recipientId: currentUser.userId };
		if (type) {
			where.type = type;
		}

		// 查询通知列表
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

		// 判断是否有下一页，截取实际返回数量
		const hasMore = notifications.length > PAGE_SIZE;
		const items = hasMore ? notifications.slice(0, PAGE_SIZE) : notifications;
		const nextCursor = hasMore ? items[items.length - 1].id : null;

		// 批量查询帖子作者用户名（用于构建帖子链接）
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

		// 为每条通知附加 postAuthorUsername
		const itemsWithAuthor = items.map((n: any) => ({
			...n,
			postAuthorUsername: n.postId ? (postAuthorMap.get(n.postId) ?? null) : null
		}));

		return { items: itemsWithAuthor, nextCursor, hasMore };
	}
});

/**
 * 删除全部通知 Action
 *
 * 删除当前用户收到的所有通知。
 * 需要登录认证。
 *
 * @param input - 无
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { deletedCount: number } 被删除的通知数量
 */
const deleteAllNotifications = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		// 删除当前用户收到的所有通知
		const result = await prisma.notification.deleteMany({
			where: { recipientId: currentUser.userId }
		});

		return { deletedCount: result.count };
	}
});

/**
 * 删除单条通知 Action
 *
 * 确认通知存在且 recipientId 匹配当前用户后删除。
 * 需要登录认证。
 *
 * @param input - { notificationId: 通知 ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { deleted: true }
 */
const deleteNotification = defineAction({
	input: z.object({
		notificationId: z.string().min(1, '通知 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { notificationId } = input;

		// 查询通知，确认属于当前用户
		const notification = await prisma.notification.findUnique({
			where: { id: notificationId },
			select: { recipientId: true }
		});

		if (!notification) {
			throw new ActionError({ code: 'NOT_FOUND', message: '通知不存在' });
		}

		if (notification.recipientId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权删除此通知' });
		}

		// 删除通知
		await prisma.notification.delete({
			where: { id: notificationId }
		});

		return { deleted: true };
	}
});

/**
 * 标记通知已读 Action
 *
 * ids 为空则标记全部已读，否则标记指定 ID 的通知。
 * 限制 ids 数组长度 100，防止批量操作过大。
 * 需要登录认证。
 *
 * @param input - { ids?: 通知 ID 数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { updatedCount: number } 更新的记录数
 */
const markNotificationsReadAction = defineAction({
	input: z.object({
		ids: z.array(z.string()).optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		let { ids } = input;

		// 如果 ids 为空数组，视为标记全部已读
		if (ids && ids.length === 0) {
			ids = undefined;
		}

		// 限制 ids 数组长度，防止批量操作过大
		if (ids && ids.length > 100) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '通知 ID 数量不能超过 100' });
		}

		// 标记已读
		const updatedCount = await markNotificationsRead(currentUser.userId, ids);

		return { updatedCount };
	}
});

export {
	getUnreadCountAction as getUnreadCount,
	getNotifications,
	deleteAllNotifications,
	deleteNotification,
	markNotificationsReadAction as markNotificationsRead
};
