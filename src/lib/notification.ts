/**
 * 通知工具模块
 *
 * 提供通知的创建、标记已读、获取未读数量等核心功能。
 * 通知类型包括：follow（关注）、comment（评论）、like（点赞）、mention（提及）。
 */
import { prisma } from '@/lib/db';
import { triggerWebhooks } from '@/lib/webhook';

/** 允许的通知类型 */
const VALID_TYPES = ['follow', 'comment', 'like', 'mention'] as const;
type NotificationType = (typeof VALID_TYPES)[number];

/**
 * 创建通知
 *
 * 当用户触发某操作（关注、评论、点赞、提及）时，向接收者发送通知。
 * 不会给自己发通知（actorId === recipientId 时直接跳过）。
 * 若接收者关闭了通知（notificationsEnabled = false），也跳过创建。
 * type 必须为 follow / comment / like / mention 之一，否则抛错。
 *
 * @param type - 通知类型：follow | comment | like | mention
 * @param actorId - 触发者用户 ID
 * @param recipientId - 接收者用户 ID
 * @param postId - 关联帖子 ID（可选，关注类通知无此字段）
 * @param commentId - 关联评论 ID（可选，仅评论/提及类通知使用）
 * @returns 创建的通知记录，若跳过则返回 null
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

	// 创建通知成功后触发 Webhook（异步执行，不阻塞主流程）
	triggerWebhooks(recipientId, `notification.${type}`, {
		id: notification.id,
		type,
		actorId,
		recipientId,
		postId: postId ?? null,
		commentId: commentId ?? null,
		createdAt: notification.createdAt.toISOString()
	}).catch(() => {});

	return notification;
}

/**
 * 标记通知已读
 *
 * 将指定用户的通知标记为已读。
 * 若 notificationIds 为空或未提供，则标记该用户全部通知为已读。
 *
 * @param userId - 接收者用户 ID
 * @param notificationIds - 要标记已读的通知 ID 列表（可选）
 * @returns 更新的记录数
 */
export async function markNotificationsRead(userId: string, notificationIds?: string[]) {
	if (notificationIds && notificationIds.length > 0) {
		// 标记指定通知为已读
		const result = await prisma.notification.updateMany({
			where: {
				id: { in: notificationIds },
				recipientId: userId,
				isRead: false
			},
			data: { isRead: true }
		});
		return result.count;
	}

	// 标记全部未读通知为已读
	const result = await prisma.notification.updateMany({
		where: {
			recipientId: userId,
			isRead: false
		},
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
