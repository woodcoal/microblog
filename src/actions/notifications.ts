/**
 * 通知 Actions
 *
 * 提供通知查询、删除、标记已读等服务端 Actions。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	getUnreadNotificationCount,
	getNotifications as getNotificationsService,
	deleteAllNotifications as deleteAllNotificationsService,
	deleteNotification as deleteNotificationService,
	markNotificationsReadService
} from '@/services/notification.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

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

		try {
			return await getUnreadNotificationCount({ userId: currentUser.userId });
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 获取通知列表 Action
 *
 * 游标分页，每页 20 条，按时间倒序排列。
 * 支持 type 筛选通知类型。
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

		try {
			return await getNotificationsService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
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

		try {
			return await deleteAllNotificationsService({ userId: currentUser.userId });
		} catch (e) {
			handleServiceError(e);
		}
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

		try {
			return await deleteNotificationService({
				userId: currentUser.userId,
				notificationId: input.notificationId
			});
		} catch (e) {
			handleServiceError(e);
		}
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

		try {
			return await markNotificationsReadService({
				userId: currentUser.userId,
				ids: input.ids
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

export {
	getUnreadCountAction as getUnreadCount,
	getNotifications,
	deleteAllNotifications,
	deleteNotification,
	markNotificationsReadAction as markNotificationsRead
};
