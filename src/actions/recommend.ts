/**
 * 推荐系统相关 Actions
 *
 * 定义个性化推荐和浏览记录等服务端 Actions。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	getRecommend as getRecommendService,
	recordRead as recordReadService
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
 * 根据用户历史行为，返回 Gorse 推荐引擎生成的个性化帖子列表。
 * 需要登录认证。Gorse 未配置时返回空列表。
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
 * 记录浏览行为 Action
 *
 * 将用户浏览帖子的行为异步记录到 Gorse 推荐引擎。
 * 需要登录认证。Gorse 未配置时静默返回成功。
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

export { getRecommend, recordRead };
