/**
 * 推荐系统相关 Actions
 *
 * 定义个性化推荐、相似推荐、浏览记录和用户画像等服务端 Actions。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	getRecommend as getRecommendService,
	getSimilarPosts as getSimilarPostsService,
	recordRead as recordReadService,
	getUserProfile as getUserProfileService
} from '@/services/recommend.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 获取个性化推荐 Action
 *
 * 根据用户画像，返回 DaLi.Lens 推荐引擎生成的个性化帖子列表。
 * 需要登录认证。Lens 未配置时返回空列表。
 *
 * @param input - { n?: 返回数量，默认 5 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { items: [...] } 推荐帖子列表
 */
const getRecommend = defineAction({
	input: z.object({
		n: z.number().int().min(1).max(50).optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await getRecommendService({
				userId: currentUser.userId,
				n: input.n
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 获取相似帖子 Action
 *
 * 查找与指定帖子相似的其他帖子，用于详情页"相关推荐"。
 * 需要登录认证。Lens 未配置时返回空列表。
 *
 * @param input - { postId: 帖子ID, n?: 返回数量，默认 5 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { items: [...] } 相似帖子列表
 */
const getSimilarPosts = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		n: z.number().int().min(1).max(20).optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await getSimilarPostsService({
				userId: currentUser.userId,
				postId: input.postId,
				n: input.n
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 记录浏览行为 Action
 *
 * 将用户浏览帖子的行为同步到 DaLi.Lens，用于更新用户画像。
 * 需要登录认证。Lens 未配置时静默返回成功。
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { recorded: true } 记录成功
 */
const recordRead = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await recordReadService({
				userId: currentUser.userId,
				postId: input.postId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 获取用户画像 Action
 *
 * 返回用户在 DaLi.Lens 中的兴趣画像，包括交互统计和分类偏好。
 * 需要登录认证。Lens 未配置或新用户时返回空画像。
 *
 * @param input - 无入参
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { interactionCount, topCategories } 用户画像数据
 */
const getUserProfile = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await getUserProfileService({
				userId: currentUser.userId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

export { getRecommend, getSimilarPosts, recordRead, getUserProfile };
