/**
 * 帖子相关 Actions
 *
 * 定义帖子点赞用户列表、置顶切换、密码验证等服务端 Actions。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	getPostLikers as getPostLikersService,
	togglePin as togglePinService,
	verifyPostPassword as verifyPostPasswordService
} from '@/services/posts.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 获取帖子点赞用户列表 Action
 *
 * 查询指定帖子的点赞用户列表，按点赞时间倒序排列。
 * 不需要认证，任何人可查看。
 *
 * @param input - { postId: 帖子ID }
 * @returns { users: [{ username, displayName, avatarUrl }] } 点赞用户列表
 */
const getPostLikers = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input) => {
		try {
			return await getPostLikersService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 切换帖子置顶状态 Action
 *
 * 对帖子进行置顶/取消置顶切换操作。
 * 需要登录认证，仅帖子作者可操作。
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { pinned: boolean } 当前置顶状态
 */
const togglePin = defineAction({
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
			return await togglePinService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 验证密码保护帖子 Action
 *
 * 验证用户输入的密码是否匹配密码保护帖子的密码。
 * 不需要认证，任何人可尝试验证。
 *
 * @param input - { postId: 帖子ID, password: 用户输入的密码 }
 * @returns { valid: boolean } 密码是否正确
 */
const verifyPostPassword = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		password: z.string().min(1, '请输入密码')
	}),
	handler: async (input) => {
		try {
			return await verifyPostPasswordService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

export { getPostLikers, togglePin, verifyPostPassword };
