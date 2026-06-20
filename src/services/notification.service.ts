/**
 * 通知 Service
 *
 * 编排通知查询、删除、标记已读的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { ServiceError } from '@/lib/errors';
import {
	getUnreadCount,
	markNotificationsRead,
	findNotifications,
	findNotificationById,
	deleteNotificationById,
	deleteAllNotifications as deleteAllNotificationsFromLib
} from '@/lib/notification';
import { findUserSettings } from '@/lib/settings';
import { findPostsByIds } from '@/lib/post';

/** 每页通知数量 */
const PAGE_SIZE = 20;

/** 合法的通知类型筛选值 */
const VALID_TYPES = ['follow', 'comment', 'like', 'mention'];

// ── Agent API 专用查询函数 ──

/**
 * Agent 通知列表查询
 *
 * 支持状态、类型、时间范围过滤和分页排序。
 * 供 Agent API 层获取通知列表。
 *
 * @param input - 查询参数
 * @returns 通知列表（含 actor 信息）
 */
export async function getAgentNotifications(input: {
	recipientId: string;
	status?: string;
	type?: string;
	from?: Date;
	to?: Date;
	sort?: string;
	skip?: number;
	limit?: number;
}): Promise<any[]> {
	const { recipientId, status, type, from, to, sort, limit } = input;

	// 构建 where 条件
	const where: Record<string, unknown> = {
		recipientId
	};

	// 状态过滤
	if (status === 'read') {
		where.isRead = true;
	} else if (status === 'unread') {
		where.isRead = false;
	}

	// 类型过滤
	if (type) {
		where.type = type;
	}

	// 时间范围过滤
	if (from || to) {
		const createdAtFilter: Record<string, Date> = {};
		if (from) createdAtFilter.gte = from;
		if (to) createdAtFilter.lte = to;
		where.createdAt = createdAtFilter;
	}

	// 排序
	const orderBy =
		sort === 'earliest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

	// 查询通知
	return findNotifications(
		where,
		{
			actor: {
				select: { username: true, displayName: true }
			}
		},
		orderBy,
		limit,
		undefined
	);
}

// ── 类型定义 ──

export interface GetUnreadCountInput {
	userId: string;
}

export interface GetNotificationsInput {
	userId: string;
	cursor?: string;
	type?: string;
}

export interface NotificationItem {
	id: string;
	type: string;
	actorId: string;
	recipientId: string;
	postId: string | null;
	commentId: string | null;
	isRead: boolean;
	createdAt: string;
	actor: {
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
	};
	postAuthorUsername: string | null;
}

export interface GetNotificationsResult {
	items: NotificationItem[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface DeleteAllNotificationsInput {
	userId: string;
}

export interface DeleteNotificationInput {
	userId: string;
	notificationId: string;
}

export interface MarkNotificationsReadInput {
	userId: string;
	ids?: string[];
}

// ── 业务函数 ──

/**
 * 获取未读通知数量
 *
 * 检查用户通知开关，关闭则返回 0，否则查询未读通知数量。
 *
 * @param input - { userId }
 * @returns 未读通知数量
 */
export async function getUnreadNotificationCount(
	input: GetUnreadCountInput
): Promise<{ count: number }> {
	const { userId } = input;

	// 检查通知开关
	const settings = await findUserSettings(userId, {
		notificationsEnabled: true
	});
	if (settings && !settings.notificationsEnabled) {
		return { count: 0 };
	}

	// 查询未读数量
	const count = await getUnreadCount(userId);

	return { count };
}

/**
 * 获取通知列表
 *
 * 游标分页，每页 20 条，按时间倒序排列。
 * 支持 type 筛选通知类型。
 * 每条通知包含触发者（actor）的用户信息和帖子作者用户名。
 *
 * @param input - { userId, cursor?, type? }
 * @returns 通知列表和分页信息
 */
export async function getNotifications(
	input: GetNotificationsInput
): Promise<GetNotificationsResult> {
	const { userId, cursor, type } = input;

	// 验证类型筛选参数合法性
	if (type && !VALID_TYPES.includes(type)) {
		throw new ServiceError('BAD_REQUEST', '无效的通知类型筛选');
	}

	// 构建查询条件
	const where: any = { recipientId: userId };
	if (type) {
		where.type = type;
	}

	// 查询通知列表
	const notifications = await findNotifications(
		where,
		{
			actor: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}
		},
		{ createdAt: 'desc' },
		PAGE_SIZE + 1,
		cursor ?? undefined
	);

	// 判断是否有下一页，截取实际返回数量
	const hasMore = notifications.length > PAGE_SIZE;
	const items = hasMore ? notifications.slice(0, PAGE_SIZE) : notifications;
	const nextCursor = hasMore ? items[items.length - 1].id : null;

	// 批量查询帖子作者用户名（用于构建帖子链接）
	const postIds = [...new Set(items.map((n) => n.postId).filter(Boolean))] as string[];
	const postAuthorMap = new Map<string, string>();
	if (postIds.length > 0) {
		const posts = await findPostsByIds(postIds, undefined, undefined, {
			id: true,
			user: { select: { username: true } }
		});
		for (const p of posts as any[]) {
			postAuthorMap.set(p.id, p.user.username);
		}
	}

	// 为每条通知附加 postAuthorUsername
	const itemsWithAuthor: NotificationItem[] = items.map((n: any) => ({
		id: n.id,
		type: n.type,
		actorId: n.actorId,
		recipientId: n.recipientId,
		postId: n.postId,
		commentId: n.commentId,
		isRead: n.isRead,
		createdAt: n.createdAt.toISOString(),
		actor: n.actor,
		postAuthorUsername: n.postId ? (postAuthorMap.get(n.postId) ?? null) : null
	}));

	return { items: itemsWithAuthor, nextCursor, hasMore };
}

/**
 * 删除全部通知
 *
 * 删除指定用户收到的所有通知。
 *
 * @param input - { userId }
 * @returns 被删除的通知数量
 */
export async function deleteAllNotifications(
	input: DeleteAllNotificationsInput
): Promise<{ deletedCount: number }> {
	const { userId } = input;

	// 删除用户收到的所有通知
	const deletedCount = await deleteAllNotificationsFromLib(userId);

	return { deletedCount };
}

/**
 * 删除单条通知
 *
 * 确认通知存在且 recipientId 匹配当前用户后删除。
 *
 * @param input - { userId, notificationId }
 * @returns 删除结果
 */
export async function deleteNotification(
	input: DeleteNotificationInput
): Promise<{ deleted: true }> {
	const { userId, notificationId } = input;

	// 查询通知，确认属于当前用户
	const notification = await findNotificationById(notificationId, {
		recipientId: true
	});

	if (!notification) {
		throw new ServiceError('NOT_FOUND', '通知不存在');
	}

	if (notification.recipientId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权删除此通知');
	}

	// 删除通知
	await deleteNotificationById(notificationId);

	return { deleted: true };
}

/**
 * 标记通知已读
 *
 * ids 为空则标记全部已读，否则标记指定 ID 的通知。
 * 限制 ids 数组长度 100，防止批量操作过大。
 *
 * @param input - { userId, ids? }
 * @returns 更新的记录数
 */
export async function markNotificationsReadService(
	input: MarkNotificationsReadInput
): Promise<{ updatedCount: number }> {
	const { userId, ids } = input;

	let notificationIds = ids;

	// 如果 ids 为空数组，视为标记全部已读
	if (notificationIds && notificationIds.length === 0) {
		notificationIds = undefined;
	}

	// 限制 ids 数组长度，防止批量操作过大
	if (notificationIds && notificationIds.length > 100) {
		throw new ServiceError('BAD_REQUEST', '通知 ID 数量不能超过 100');
	}

	// 标记已读
	const updatedCount = await markNotificationsRead(userId, notificationIds);

	return { updatedCount };
}
