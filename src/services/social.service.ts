/**
 * 社交互动 Service
 *
 * 编排点赞、关注、收藏的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { ServiceError } from '@/lib/errors';
import { createNotification } from '@/lib/notification';
import {
	logActivity,
	LIKE_CREATE,
	LIKE_REMOVE,
	FOLLOW_CREATE,
	FOLLOW_REMOVE,
	BOOKMARK_CREATE,
	BOOKMARK_REMOVE
} from '@/lib/activity';
import { findLike, upsertLike, deleteLike, countLikes } from '@/lib/social';
import { findFollow, upsertFollow, deleteFollow, countFollows } from '@/lib/social';
import { findBookmark, upsertBookmark, deleteBookmark, countBookmarks } from '@/lib/social';
import { findPostById, findPostByIdSelect } from '@/lib/post';
import { findCommentById, findCommentByIdSelect } from '@/lib/comment';
import { findUserByUsername } from '@/lib/user';

// ── Agent API 专用查询函数 ──

/**
 * 检查点赞状态
 *
 * 查询用户对指定帖子的点赞记录是否存在。
 * 供 Agent API 层判断当前状态，实现幂等操作。
 *
 * @param input - { userId, postId }
 * @returns 是否已点赞
 */
export async function checkLikeStatus(input: { userId: string; postId: string }): Promise<boolean> {
	const { userId, postId } = input;
	const existingLike = await findLike({
		userId_postId: { userId, postId }
	});
	return !!existingLike;
}

/**
 * 检查关注状态
 *
 * 查询当前用户是否关注了目标用户。
 * 先验证目标用户存在，再查询关注记录。
 * 供 Agent API 层判断当前状态，实现幂等操作。
 *
 * @param input - { userId, username }
 * @returns 目标用户 ID 和是否已关注；目标用户不存在时返回 null
 */
export async function checkFollowStatus(input: {
	userId: string;
	username: string;
}): Promise<{ targetUserId: string; following: boolean } | null> {
	const { userId, username } = input;

	// 查询目标用户
	const targetUser = await findUserByUsername(username, { id: true });
	if (!targetUser) {
		return null;
	}

	// 查询关注记录
	const existingFollow = await findFollow({
		followerId_followingId: {
			followerId: userId,
			followingId: targetUser.id
		}
	});

	return {
		targetUserId: targetUser.id,
		following: !!existingFollow
	};
}

// ── 类型定义 ──

export interface ToggleLikeInput {
	userId: string;
	targetId: string;
	type: 'post' | 'comment';
}

export interface ToggleLikeResult {
	liked: boolean;
	likeCount: number;
}

export interface ToggleFollowInput {
	userId: string;
	username: string;
}

export interface ToggleFollowResult {
	following: boolean;
	followerCount: number;
}

export interface ToggleBookmarkInput {
	userId: string;
	postId: string;
}

export interface ToggleBookmarkResult {
	bookmarked: boolean;
	bookmarkCount: number;
}

// ── 业务函数 ──

/**
 * 切换点赞
 *
 * 对帖子或评论进行点赞/取消点赞切换操作。
 * 已点赞则取消，未点赞则点赞。
 */
export async function toggleLike(input: ToggleLikeInput): Promise<ToggleLikeResult> {
	const { userId, targetId, type } = input;

	// 1. 根据类型检查目标存在且未删除
	if (type === 'post') {
		const post = await findPostById(targetId);
		if (!post) {
			throw new ServiceError('NOT_FOUND', '帖子不存在');
		}
		if (post.isDeleted) {
			throw new ServiceError('BAD_REQUEST', '帖子已删除');
		}
	} else {
		const comment = await findCommentById(targetId);
		if (!comment) {
			throw new ServiceError('NOT_FOUND', '评论不存在');
		}
		if (comment.isDeleted) {
			throw new ServiceError('BAD_REQUEST', '评论已删除');
		}
	}

	// 2. 查询当前点赞状态（仅用于确定操作意图）
	const whereClause =
		type === 'post'
			? { userId_postId: { userId, postId: targetId } }
			: { userId_commentId: { userId, commentId: targetId } };

	const existingLike = await findLike(whereClause);

	let liked: boolean;
	if (existingLike) {
		// 已点赞 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
		try {
			await deleteLike(whereClause);
		} catch (deleteError: any) {
			if (deleteError?.code !== 'P2025') throw deleteError;
		}
		liked = false;

		// 记录取消点赞活动（异步，不阻塞主流程）
		if (type === 'post') {
			const post = await findPostByIdSelect(targetId, { userId: true });
			if (post) {
				logActivity(LIKE_REMOVE, userId, 'post', targetId, post.userId, targetId).catch(
					() => {}
				);
			}
		} else {
			const comment = await findCommentByIdSelect(targetId, {
				id: true,
				userId: true,
				postId: true
			});
			if (comment) {
				logActivity(
					LIKE_REMOVE,
					userId,
					'comment',
					targetId,
					comment.userId,
					comment.postId
				).catch(() => {});
			}
		}
	} else {
		// 未点赞 → 点赞：使用 upsert 避免竞态，已存在则忽略
		const createData =
			type === 'post' ? { userId, postId: targetId } : { userId, commentId: targetId };

		await upsertLike(whereClause, createData);
		liked = true;

		// 发送点赞通知 + 记录活动（异步，不阻塞主流程）
		if (type === 'post') {
			const post = await findPostByIdSelect(targetId, { userId: true });
			if (post) {
				createNotification('like', userId, post.userId, targetId).catch(() => {});
				logActivity(LIKE_CREATE, userId, 'post', targetId, post.userId, targetId).catch(
					() => {}
				);
			}
		} else {
			const comment = await findCommentByIdSelect(targetId, {
				id: true,
				userId: true,
				postId: true
			});
			if (comment) {
				createNotification(
					'like',
					userId,
					comment.userId,
					comment.postId,
					comment.id
				).catch(() => {});
				logActivity(
					LIKE_CREATE,
					userId,
					'comment',
					targetId,
					comment.userId,
					comment.postId
				).catch(() => {});
			}
		}
	}

	// 3. 统计当前点赞数
	const likeCount = await countLikes(
		type === 'post' ? { postId: targetId } : { commentId: targetId }
	);

	return { liked, likeCount };
}

/**
 * 切换关注
 *
 * 对目标用户进行关注/取关切换操作。
 * 已关注则取关，未关注则关注。
 */
export async function toggleFollow(input: ToggleFollowInput): Promise<ToggleFollowResult> {
	const { userId, username } = input;

	// 1. 检查目标用户存在
	const targetUser = await findUserByUsername(username, { id: true });
	if (!targetUser) {
		throw new ServiceError('NOT_FOUND', '用户不存在');
	}

	// 2. 不能关注自己
	if (targetUser.id === userId) {
		throw new ServiceError('BAD_REQUEST', '不能关注自己');
	}

	// 3. 查询当前关注状态（仅用于确定操作意图）
	const followWhere = {
		followerId_followingId: {
			followerId: userId,
			followingId: targetUser.id
		}
	};

	const existingFollow = await findFollow(followWhere);

	let following: boolean;
	if (existingFollow) {
		// 已关注 → 取关：直接 delete 并 catch P2025（记录不存在），避免竞态
		try {
			await deleteFollow(followWhere);
		} catch (deleteError: any) {
			if (deleteError?.code !== 'P2025') throw deleteError;
		}
		following = false;

		// 记录取关活动（异步，不阻塞主流程）
		logActivity(FOLLOW_REMOVE, userId, 'user', targetUser.id, targetUser.id).catch(() => {});
	} else {
		// 未关注 → 关注：使用 upsert 避免竞态，已存在则忽略
		await upsertFollow(followWhere, {
			followerId: userId,
			followingId: targetUser.id
		});
		following = true;

		// 发送关注通知 + 记录活动（异步，不阻塞主流程）
		createNotification('follow', userId, targetUser.id).catch(() => {});
		logActivity(FOLLOW_CREATE, userId, 'user', targetUser.id, targetUser.id).catch(() => {});
	}

	// 4. 统计目标用户粉丝数
	const followerCount = await countFollows({ followingId: targetUser.id });

	return { following, followerCount };
}

/**
 * 切换收藏
 *
 * 对帖子进行收藏/取消收藏切换操作。
 * 已收藏则取消，未收藏则收藏。
 */
export async function toggleBookmark(input: ToggleBookmarkInput): Promise<ToggleBookmarkResult> {
	const { userId, postId } = input;

	// 1. 检查帖子存在且未删除
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}
	if (post.isDeleted) {
		throw new ServiceError('BAD_REQUEST', '帖子已删除');
	}

	// 2. 查询当前收藏状态（仅用于确定操作意图）
	const bookmarkWhere = {
		userId_postId: {
			userId,
			postId
		}
	};

	const existingBookmark = await findBookmark(bookmarkWhere);

	let bookmarked: boolean;
	if (existingBookmark) {
		// 已收藏 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
		try {
			await deleteBookmark(bookmarkWhere);
		} catch (deleteError: any) {
			if (deleteError?.code !== 'P2025') throw deleteError;
		}
		bookmarked = false;

		// 记录取消收藏活动（异步，不阻塞主流程）
		logActivity(BOOKMARK_REMOVE, userId, 'post', postId, post.userId, postId).catch(() => {});
	} else {
		// 未收藏 → 收藏：使用 upsert 避免竞态，已存在则忽略
		await upsertBookmark(bookmarkWhere, {
			userId,
			postId
		});
		bookmarked = true;

		// 记录收藏活动（异步，不阻塞主流程）
		logActivity(BOOKMARK_CREATE, userId, 'post', postId, post.userId, postId).catch(() => {});
	}

	// 3. 统计当前收藏数
	const bookmarkCount = await countBookmarks({ postId });

	return { bookmarked, bookmarkCount };
}
