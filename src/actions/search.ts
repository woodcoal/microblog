/**
 * 搜索功能 Actions
 *
 * 提供用户搜索和建议功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	searchUsers as searchUsersService,
	searchSuggest as searchSuggestService
} from '@/services/search.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(e.code), message: e.message });
	}
	throw e;
}

/**
 * 按用户名搜索用户 Action
 *
 * 根据逗号分隔的用户名列表查询匹配的用户（精确匹配）。
 * 用于 visibility=users 时查找指定用户 ID。
 * 需要登录认证。
 *
 * @param input - { usernames: 用户名数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 用户列表（id、username、displayName、avatarUrl）
 */
export const searchUsers = defineAction({
	input: z.object({
		usernames: z.array(z.string().min(1)).min(1, '至少输入一个用户名')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await searchUsersService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 搜索建议 Action
 *
 * 根据关键词前缀返回匹配的标签、用户和分类，用于搜索框自动补全。
 * 不需要认证。
 *
 * @param input - { query: 搜索关键词, limit?: 每类最大返回条数（默认 5） }
 * @returns 标签、用户和分类的搜索建议
 */
export const searchSuggest = defineAction({
	input: z.object({
		query: z.string().min(1, '搜索关键词不能为空'),
		limit: z.number().int().min(1).max(20).optional()
	}),
	handler: async (input) => {
		try {
			return await searchSuggestService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});
