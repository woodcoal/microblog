/**
 * 操作记录模块
 *
 * 提供统一的用户操作日志记录功能，用于追踪帖子、评论、点赞、关注等行为。
 * 所有写入均为异步非阻塞，不影响主业务流程。
 */

import { prisma } from '@/lib/db';

/** 操作类型：帖子相关 */
const POST_CREATE = 'post.create';
const POST_UPDATE = 'post.update';
const POST_DELETE = 'post.delete';

/** 操作类型：评论相关 */
const COMMENT_CREATE = 'comment.create';
const COMMENT_DELETE = 'comment.delete';

/** 操作类型：点赞相关 */
const LIKE_CREATE = 'like.create';
const LIKE_REMOVE = 'like.remove';

/** 操作类型：关注相关 */
const FOLLOW_CREATE = 'follow.create';
const FOLLOW_REMOVE = 'follow.remove';

/** 目标类型 */
type TargetType = 'post' | 'comment' | 'user';

/**
 * 记录一条用户操作日志
 *
 * 功能：将操作行为写入 ActivityLog 表，用于动态流、通知等场景的数据源。
 * 内部包含 try-catch 错误处理，写入失败时仅记录日志，不会将异常冒泡给调用方。
 *
 * @param action      - 操作类型，如 'post.create'、'like.remove' 等
 * @param actorId     - 操作者用户 ID
 * @param targetType  - 目标类型：'post' | 'comment' | 'user'
 * @param targetId    - 目标对象 ID（帖子ID / 评论ID / 用户ID）
 * @param targetUserId - 可选，原始内容所属用户 ID（用于通知场景）
 * @param postId      - 可选，关联帖子 ID（评论、点赞等场景需要关联到具体帖子）
 */
export async function logActivity(
	action: string,
	actorId: string,
	targetType: TargetType,
	targetId: string,
	targetUserId?: string,
	postId?: string
): Promise<void> {
	try {
		await prisma.activityLog.create({
			data: {
				action,
				actorId,
				targetType,
				targetId,
				targetUserId,
				postId
			}
		});
	} catch (error) {
		// 写入失败仅记录日志，不冒泡异常，不影响主业务流程
		console.error('记录操作日志失败:', error);
	}
}

export {
	POST_CREATE,
	POST_UPDATE,
	POST_DELETE,
	COMMENT_CREATE,
	COMMENT_DELETE,
	LIKE_CREATE,
	LIKE_REMOVE,
	FOLLOW_CREATE,
	FOLLOW_REMOVE
};
