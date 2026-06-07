/**
 * 社交互动 Actions
 *
 * 提供点赞、关注、书签等社交互动功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
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
import {
	insertFeedback,
	deleteFeedback,
	FEEDBACK_TYPE_LIKE,
	FEEDBACK_TYPE_BOOKMARK
} from '@/lib/gorse';

/**
 * 切换点赞 Action
 *
 * 对帖子或评论进行点赞/取消点赞切换操作。
 * 已点赞则取消，未点赞则点赞。
 * 需要登录认证。
 *
 * @param input - { targetId: 目标ID, type: 'post' | 'comment' }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { liked: boolean, likeCount: number } 当前点赞状态和点赞数
 */
export const toggleLike = defineAction({
	input: z.object({
		targetId: z.string().min(1, '目标 ID 不能为空'),
		type: z.enum(['post', 'comment'])
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { targetId, type } = input;

		// 2. 根据类型检查目标存在且未删除
		if (type === 'post') {
			const post = await prisma.post.findUnique({ where: { id: targetId } });
			if (!post) {
				throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
			}
			if (post.isDeleted) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除' });
			}
		} else {
			const comment = await prisma.comment.findUnique({ where: { id: targetId } });
			if (!comment) {
				throw new ActionError({ code: 'NOT_FOUND', message: '评论不存在' });
			}
			if (comment.isDeleted) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '评论已删除' });
			}
		}

		// 3. 查询当前点赞状态（仅用于确定操作意图）
		const whereClause =
			type === 'post'
				? { userId_postId: { userId: currentUser.userId, postId: targetId } }
				: { userId_commentId: { userId: currentUser.userId, commentId: targetId } };

		const existingLike = await prisma.like.findUnique({ where: whereClause });

		let liked: boolean;
		if (existingLike) {
			// 已点赞 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.like.delete({ where: whereClause });
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			liked = false;

			// 记录取消点赞活动（异步，不阻塞主流程）
			if (type === 'post') {
				const post = await prisma.post.findUnique({
					where: { id: targetId },
					select: { userId: true }
				});
				if (post) {
					logActivity(
						LIKE_REMOVE,
						currentUser.userId,
						'post',
						targetId,
						post.userId,
						targetId
					).catch(() => {});
					// 同步删除 Gorse 点赞反馈（异步，不阻塞）
					deleteFeedback(currentUser.userId, targetId, FEEDBACK_TYPE_LIKE).catch(
						() => {}
					);
				}
			} else {
				const comment = await prisma.comment.findUnique({
					where: { id: targetId },
					select: { userId: true, postId: true }
				});
				if (comment) {
					logActivity(
						LIKE_REMOVE,
						currentUser.userId,
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
				type === 'post'
					? { userId: currentUser.userId, postId: targetId }
					: { userId: currentUser.userId, commentId: targetId };

			await prisma.like.upsert({
				where: whereClause,
				update: {},
				create: createData
			});
			liked = true;

			// 发送点赞通知 + 记录活动（异步，不阻塞主流程）
			if (type === 'post') {
				const post = await prisma.post.findUnique({
					where: { id: targetId },
					select: { userId: true }
				});
				if (post) {
					createNotification('like', currentUser.userId, post.userId, targetId).catch(
						() => {}
					);
					logActivity(
						LIKE_CREATE,
						currentUser.userId,
						'post',
						targetId,
						post.userId,
						targetId
					).catch(() => {});
					// 同步插入 Gorse 点赞反馈（异步，不阻塞）
					insertFeedback(
						currentUser.userId,
						targetId,
						FEEDBACK_TYPE_LIKE,
						new Date().toISOString()
					).catch(() => {});
				}
			} else {
				const comment = await prisma.comment.findUnique({
					where: { id: targetId },
					select: { userId: true, postId: true }
				});
				if (comment) {
					createNotification(
						'like',
						currentUser.userId,
						comment.userId,
						comment.postId,
						comment.id
					).catch(() => {});
					logActivity(
						LIKE_CREATE,
						currentUser.userId,
						'comment',
						targetId,
						comment.userId,
						comment.postId
					).catch(() => {});
				}
			}
		}

		// 4. 统计当前点赞数
		const likeCount = await prisma.like.count({
			where: type === 'post' ? { postId: targetId } : { commentId: targetId }
		});

		return { liked, likeCount };
	}
});

/**
 * 切换关注 Action
 *
 * 对目标用户进行关注/取关切换操作。
 * 已关注则取关，未关注则关注。
 * 需要登录认证，不能关注自己。
 *
 * @param input - { username: 目标用户名 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { following: boolean, followerCount: number } 当前关注状态和粉丝数
 */
export const toggleFollow = defineAction({
	input: z.object({
		username: z.string().min(1, '用户名不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { username } = input;

		// 2. 检查目标用户存在
		const targetUser = await prisma.user.findUnique({
			where: { username },
			select: { id: true }
		});
		if (!targetUser) {
			throw new ActionError({ code: 'NOT_FOUND', message: '用户不存在' });
		}

		// 3. 不能关注自己
		if (targetUser.id === currentUser.userId) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '不能关注自己' });
		}

		// 4. 查询当前关注状态（仅用于确定操作意图）
		const existingFollow = await prisma.follow.findUnique({
			where: {
				followerId_followingId: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			}
		});

		let following: boolean;
		if (existingFollow) {
			// 已关注 → 取关：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.follow.delete({
					where: {
						followerId_followingId: {
							followerId: currentUser.userId,
							followingId: targetUser.id
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			following = false;

			// 记录取关活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_REMOVE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		} else {
			// 未关注 → 关注：使用 upsert 避免竞态，已存在则忽略
			await prisma.follow.upsert({
				where: {
					followerId_followingId: {
						followerId: currentUser.userId,
						followingId: targetUser.id
					}
				},
				update: {},
				create: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			});
			following = true;

			// 发送关注通知（异步，不阻塞主流程）
			createNotification('follow', currentUser.userId, targetUser.id).catch(() => {});
			// 记录关注活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_CREATE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		}

		// 5. 统计目标用户粉丝数
		const followerCount = await prisma.follow.count({
			where: { followingId: targetUser.id }
		});

		return { following, followerCount };
	}
});

/**
 * 切换收藏 Action
 *
 * 对帖子进行收藏/取消收藏切换操作。
 * 已收藏则取消，未收藏则收藏。
 * 需要登录认证。
 * 使用 upsert + delete catch P2025 处理竞态条件。
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { bookmarked: boolean, bookmarkCount: number } 当前收藏状态和收藏数
 */
export const toggleBookmark = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId } = input;

		// 2. 检查帖子存在且未删除
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}
		if (post.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除' });
		}

		// 3. 查询当前收藏状态（仅用于确定操作意图）
		const existingBookmark = await prisma.bookmark.findUnique({
			where: {
				userId_postId: {
					userId: currentUser.userId,
					postId
				}
			}
		});

		let bookmarked: boolean;
		if (existingBookmark) {
			// 已收藏 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.bookmark.delete({
					where: {
						userId_postId: {
							userId: currentUser.userId,
							postId
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			bookmarked = false;

			// 记录取消收藏活动（异步，不阻塞主流程）
			logActivity(
				BOOKMARK_REMOVE,
				currentUser.userId,
				'post',
				postId,
				post.userId,
				postId
			).catch(() => {});
			// 同步删除 Gorse 收藏反馈（异步，不阻塞）
			deleteFeedback(currentUser.userId, postId, FEEDBACK_TYPE_BOOKMARK).catch(() => {});
		} else {
			// 未收藏 → 收藏：使用 upsert 避免竞态，已存在则忽略
			await prisma.bookmark.upsert({
				where: {
					userId_postId: {
						userId: currentUser.userId,
						postId
					}
				},
				update: {},
				create: {
					userId: currentUser.userId,
					postId
				}
			});
			bookmarked = true;

			// 记录收藏活动（异步，不阻塞主流程）
			logActivity(
				BOOKMARK_CREATE,
				currentUser.userId,
				'post',
				postId,
				post.userId,
				postId
			).catch(() => {});
			// 同步插入 Gorse 收藏反馈（异步，不阻塞）
			insertFeedback(
				currentUser.userId,
				postId,
				FEEDBACK_TYPE_BOOKMARK,
				new Date().toISOString()
			).catch(() => {});
		}

		// 4. 统计当前收藏数
		const bookmarkCount = await prisma.bookmark.count({
			where: { postId }
		});

		return { bookmarked, bookmarkCount };
	}
});
