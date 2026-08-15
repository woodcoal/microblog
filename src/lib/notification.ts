/**
 * 通知工具模块
 *
 * 提供通知的创建、标记已读、获取未读数量等核心功能。
 * 通知类型包括：follow（关注）、comment（评论）、like（点赞）、mention（提及）。
 */
import { prisma } from '@/lib/db';
import { triggerWebhooks, type WebhookPayload } from '@/lib/webhook';
import type { Prisma } from '../../generated/prisma/client';

/** 允许的通知类型 */
const VALID_TYPES = ['follow', 'comment', 'like', 'mention'] as const;
type NotificationType = (typeof VALID_TYPES)[number];

/** 仅将接收者可见的帖子和评论文本写入 Webhook 快照。 */
async function mayIncludePostSnapshot(
	post: { userId: string; visibility: string; allowedUserIds: string | null },
	recipientId: string
): Promise<boolean> {
	if (post.userId === recipientId || ['public', 'logged_in'].includes(post.visibility))
		return true;
	if (post.visibility === 'users') {
		try {
			return (JSON.parse(post.allowedUserIds ?? '[]') as unknown[]).includes(recipientId);
		} catch {
			return false;
		}
	}
	if (post.visibility !== 'followers' && post.visibility !== 'following') return false;
	const follow = await prisma.follow.findUnique({
		where: {
			followerId_followingId:
				post.visibility === 'followers'
					? { followerId: recipientId, followingId: post.userId }
					: { followerId: post.userId, followingId: recipientId }
		},
		select: { id: true }
	});
	return Boolean(follow);
}

/**
 * 将刚创建的通知映射为可独立消费的 Webhook 事件快照。
 *
 * @param notification - 已持久化的通知记录
 */
export async function buildNotificationWebhookPayload(notification: {
	id: string;
	type: string;
	actorId: string;
	recipientId: string;
	postId: string | null;
	commentId: string | null;
	createdAt: Date;
}): Promise<WebhookPayload | null> {
	try {
		const [actor, post, comment] = await Promise.all([
			prisma.user.findUnique({
				where: { id: notification.actorId },
				select: { id: true, username: true, displayName: true, avatarUrl: true }
			}),
			notification.postId
				? prisma.post.findUnique({
						where: { id: notification.postId },
						select: {
							id: true,
							userId: true,
							title: true,
							visibility: true,
							allowedUserIds: true,
							isDeleted: true,
							user: { select: { username: true } }
						}
					})
				: null,
			notification.commentId
				? prisma.comment.findUnique({
						where: { id: notification.commentId },
						select: { id: true, content: true, parentId: true, isDeleted: true }
					})
				: null
		]);
		if (!actor) return null;

		const postSnapshot =
			post &&
			!post.isDeleted &&
			(await mayIncludePostSnapshot(post, notification.recipientId))
				? { id: post.id, title: post.title, url: `/${post.user.username}/${post.id}` }
				: undefined;
		const commentSnapshot =
			comment && !comment.isDeleted && postSnapshot
				? {
						id: comment.id,
						content: comment.content,
						parentId: comment.parentId,
						url: `${postSnapshot.url}#comment-${comment.id}`
					}
				: undefined;
		return {
			schemaVersion: 1,
			id: notification.id,
			event: `notification.${notification.type}`,
			occurredAt: notification.createdAt.toISOString(),
			data: {
				notification: {
					id: notification.id,
					type: notification.type,
					createdAt: notification.createdAt.toISOString()
				},
				actor: { ...actor, avatarUrl: actor.avatarUrl || null },
				...(postSnapshot ? { post: postSnapshot } : {}),
				...(commentSnapshot ? { comment: commentSnapshot } : {})
			}
		};
	} catch (error) {
		console.error(`构造通知 Webhook 快照失败 [${notification.id}]:`, error);
		return null;
	}
}

/**
 * 创建通知并异步投递对应 Webhook。
 *
 * @param type - 通知类型
 * @param actorId - 触发者 ID
 * @param recipientId - 接收者 ID
 * @param postId - 关联帖子 ID
 * @param commentId - 关联评论 ID
 * @returns 新建通知；自通知或关闭通知时返回 null
 */
export async function createNotification(
	type: NotificationType,
	actorId: string,
	recipientId: string,
	postId?: string,
	commentId?: string
) {
	// 不给自己发通知
	if (actorId === recipientId) {
		return null;
	}

	// 校验通知类型
	if (!VALID_TYPES.includes(type)) {
		throw new Error(`无效的通知类型: ${type}`);
	}

	// 检查接收者是否关闭了通知
	const settings = await prisma.userSettings.findUnique({
		where: { userId: recipientId },
		select: { notificationsEnabled: true }
	});
	if (settings && !settings.notificationsEnabled) {
		return null;
	}

	const notification = await prisma.notification.create({
		data: {
			type,
			actorId,
			recipientId,
			postId: postId ?? null,
			commentId: commentId ?? null
		}
	});

	// 创建通知成功后构造冻结展示快照并异步投递；失败不影响通知主流程。
	void buildNotificationWebhookPayload(notification).then((payload) => {
		if (payload) return triggerWebhooks(notification.recipientId, payload.event, payload);
	});

	return notification;
}

/**
 * 标记通知已读。
 *
 * @param userId - 接收通知的用户 ID
 * @param notificationIds - 要标记已读的通知 ID 列表；省略时标记全部
 * @returns 更新的记录数
 */
export async function markNotificationsRead(userId: string, notificationIds?: string[]) {
	if (notificationIds && notificationIds.length > 0) {
		const result = await prisma.notification.updateMany({
			where: { id: { in: notificationIds }, recipientId: userId, isRead: false },
			data: { isRead: true }
		});
		return result.count;
	}

	const result = await prisma.notification.updateMany({
		where: { recipientId: userId, isRead: false },
		data: { isRead: true }
	});
	return result.count;
}

/**
 * 获取未读通知数量
 *
 * 查询指定用户的未读通知总数。
 *
 * @param userId - 接收者用户 ID
 * @returns 未读通知数量
 */
export async function getUnreadCount(userId: string): Promise<number> {
	return prisma.notification.count({
		where: {
			recipientId: userId,
			isRead: false
		}
	});
}

/**
 * 查询通知列表（分页）
 *
 * 根据筛选条件查询通知列表，支持关联查询、排序、分页和游标。
 * take 参数用于限制返回数量，cursor 用于游标分页（跳过 cursor 指定的记录）。
 *
 * @param where - 筛选条件（Prisma NotificationWhereInput）
 * @param include - 关联查询配置（可选，如包含 actor 用户信息）
 * @param orderBy - 排序规则（可选，默认按创建时间倒序）
 * @param take - 返回数量上限（可选）
 * @param cursor - 游标分页起始 ID（可选，传入后将跳过该记录）
 * @param skip - 偏移分页跳过数量（不能与 cursor 同时使用）
 * @returns 匹配的通知列表
 */
export function findNotifications<T extends Prisma.NotificationInclude>(
	where: Prisma.NotificationWhereInput,
	include: T,
	orderBy?: Prisma.NotificationOrderByWithRelationInput,
	take?: number,
	cursor?: string,
	skip?: number
): Promise<Array<Prisma.NotificationGetPayload<{ include: T }>>>;
export function findNotifications(
	where: Prisma.NotificationWhereInput,
	include?: Prisma.NotificationInclude,
	orderBy?: Prisma.NotificationOrderByWithRelationInput,
	take?: number,
	cursor?: string,
	skip?: number
): Promise<Array<Prisma.NotificationGetPayload<Prisma.NotificationDefaultArgs>>>;
export function findNotifications(
	where: Prisma.NotificationWhereInput,
	include?: Prisma.NotificationInclude,
	orderBy?: Prisma.NotificationOrderByWithRelationInput,
	take?: number,
	cursor?: string,
	skip?: number
): Promise<unknown> {
	return prisma.notification.findMany({
		where,
		...(include ? { include } : {}),
		orderBy: orderBy ?? { createdAt: 'desc' },
		...(take ? { take } : {}),
		...(cursor ? { cursor: { id: cursor }, skip: 1 } : skip ? { skip } : {})
	});
}

/**
 * 按 ID 查询通知
 *
 * 根据通知 ID 查询单条通知记录，支持通过 select 指定返回字段。
 * 若通知不存在，返回 null。
 *
 * @param id - 通知 ID
 * @param select - 可选，Prisma select 对象，控制返回字段
 * @returns 通知记录或 null
 */
export function findNotificationById<T extends Prisma.NotificationSelect>(id: string, select?: T) {
	return prisma.notification.findUnique({
		where: { id },
		...(select ? { select } : {})
	});
}

/**
 * 按 ID 删除单条通知
 *
 * 根据通知 ID 删除一条通知记录。
 * 调用方需在业务层确认归属权后再调用此函数。
 *
 * @param id - 通知 ID
 * @returns 被删除的通知记录
 */
export function deleteNotificationById(id: string) {
	return prisma.notification.delete({
		where: { id }
	});
}

/**
 * 删除用户所有通知
 *
 * 删除指定用户（接收者）的所有通知记录。
 *
 * @param userId - 接收者用户 ID
 * @returns 删除的记录数
 */
export async function deleteAllNotifications(userId: string) {
	const result = await prisma.notification.deleteMany({
		where: { recipientId: userId }
	});
	return result.count;
}
