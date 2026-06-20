/**
 * 内容管理 Service
 *
 * 编排帖子、评论的创建、更新、删除业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findPostById } from '@/lib/post';
import { findCommentById, createCommentRecord, softDeleteComment } from '@/lib/comment';
import { ServiceError } from '@/lib/errors';
import { createNotification } from '@/lib/notification';
import { logActivity, COMMENT_CREATE, COMMENT_DELETE } from '@/lib/activity';
import { submitFeedback, FEEDBACK_ACTION_COMMENT } from '@/lib/lens';

/** 评论内容最大长度 */
const COMMENT_MAX_LENGTH = 1000;

// ── 类型定义 ──

export interface CreateCommentInput {
	userId: string;
	postId: string;
	content: string;
	parentId?: string;
}

export interface CreateCommentResult {
	id: string;
	postId: string;
	userId: string;
	parentId: string | null;
	content: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	user: {
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
	};
	likeCount: number;
	liked: boolean;
}

export interface DeleteCommentInput {
	userId: string;
	commentId: string;
}

// ── 业务函数 ──

/**
 * 创建评论
 *
 * 校验帖子存在/未删除/未锁定，校验内容，校验 parentId，
 * 创建评论记录，异步发送通知+活动日志+Lens 反馈。
 */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
	const { userId, postId, content, parentId } = input;

	// 1. 验证帖子存在、未删除、未锁定
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}
	if (post.isDeleted) {
		throw new ServiceError('BAD_REQUEST', '帖子已删除，无法评论');
	}
	if (post.isLocked) {
		throw new ServiceError('FORBIDDEN', '帖子已锁定，无法评论');
	}

	// 2. 校验内容
	if (!content || !content.trim()) {
		throw new ServiceError('BAD_REQUEST', '评论内容不能为空');
	}
	if (content.length > COMMENT_MAX_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `评论不能超过 ${COMMENT_MAX_LENGTH} 个字符`);
	}

	// 3. 验证 parentId 属于同一帖子
	if (parentId) {
		const parentComment = await findCommentById(parentId);
		if (!parentComment) {
			throw new ServiceError('NOT_FOUND', '回复的评论不存在');
		}
		if (parentComment.postId !== postId) {
			throw new ServiceError('BAD_REQUEST', '回复的评论不属于该帖子');
		}
		// 不允许回复二级评论（只支持两级）
		if (parentComment.parentId) {
			throw new ServiceError('BAD_REQUEST', '不支持多级嵌套回复');
		}
	}

	// 4. 创建评论
	const comment = await createCommentRecord(
		{
			postId,
			userId,
			parentId: parentId || null,
			content: content.trim()
		},
		{
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}
		}
	);

	// 5. 异步通知 + 活动日志 + Lens 反馈
	createNotification('comment', userId, post.userId, postId, comment.id).catch(() => {});
	logActivity(COMMENT_CREATE, userId, 'comment', comment.id, post.userId, postId).catch(() => {});
	submitFeedback(userId, postId, FEEDBACK_ACTION_COMMENT).catch(() => {});

	return {
		id: comment.id,
		postId: comment.postId,
		userId: comment.userId,
		parentId: comment.parentId,
		content: comment.content,
		isDeleted: comment.isDeleted,
		createdAt: comment.createdAt.toISOString(),
		updatedAt: comment.updatedAt.toISOString(),
		user: comment.user,
		likeCount: 0,
		liked: false
	};
}

/**
 * 删除评论（软删除）
 *
 * 校验评论存在、是作者、未删除，标记 isDeleted = true。
 */
export async function deleteComment(input: DeleteCommentInput): Promise<{ id: string }> {
	const { userId, commentId } = input;

	// 1. 验证评论存在
	const comment = await findCommentById(commentId);
	if (!comment) {
		throw new ServiceError('NOT_FOUND', '评论不存在');
	}

	// 2. 验证是评论作者
	if (comment.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权删除此评论');
	}

	// 3. 已删除的评论
	if (comment.isDeleted) {
		throw new ServiceError('BAD_REQUEST', '评论已被删除');
	}

	// 4. 软删除
	await softDeleteComment(commentId);

	// 记录删除评论活动（异步，不阻塞主流程）
	logActivity(COMMENT_DELETE, userId, 'comment', commentId, comment.userId, comment.postId).catch(
		() => {}
	);

	return { id: commentId };
}
