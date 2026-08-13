/**
 * 社交互动 Actions
 *
 * 提供点赞、关注、书签等社交互动功能。
 * 业务逻辑委托 social.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	toggleLike as toggleLikeService,
	toggleFollow as toggleFollowService,
	toggleBookmark as toggleBookmarkService
} from '@/services/social.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(e.code), message: e.message });
	}
	throw e;
}

/**
 * 切换点赞 Action
 *
 * 对帖子或评论进行点赞/取消点赞切换操作。
 */
export const toggleLike = defineAction({
	input: z.object({
		targetId: z.string().min(1, '目标 ID 不能为空'),
		type: z.enum(['post', 'comment'])
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await toggleLikeService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 切换关注 Action
 *
 * 对目标用户进行关注/取关切换操作。
 */
export const toggleFollow = defineAction({
	input: z.object({
		username: z.string().min(1, '用户名不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await toggleFollowService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 切换收藏 Action
 *
 * 对帖子进行收藏/取消收藏切换操作。
 */
export const toggleBookmark = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await toggleBookmarkService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
