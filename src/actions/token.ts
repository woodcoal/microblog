/**
 * API 令牌 Actions
 *
 * 提供 API 令牌的创建和撤销功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	createToken as createTokenService,
	revokeToken as revokeTokenService
} from '@/services/token.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 创建 API Token Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 调用 service 生成 Token 并存储
 * 3. 返回 Token 元信息 + 明文（仅此一次返回）
 *
 * @param input - { name: Token 名称 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的 Token 数据（含明文 token，仅此一次）
 */
export const createToken = defineAction({
	input: z.object({
		name: z.string().min(1, 'Token 名称不能为空').max(50, 'Token 名称不能超过 50 个字符')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await createTokenService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 撤销 API Token Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 调用 service 校验并删除 Token
 *
 * @param input - { id: Token ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 被撤销的 Token ID
 */
export const revokeToken = defineAction({
	input: z.object({
		id: z.string().min(1, 'Token ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await revokeTokenService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
