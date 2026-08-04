/**
 * 用户配置 Actions
 *
 * 提供主题设置功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import { updateTheme as updateThemeService } from '@/services/config.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 更新主题/强调色偏好 Action
 *
 * 已登录用户通过此 Action 同步主题和强调色偏好到服务端。
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 仅更新传入的字段（theme 或 accent）。
 *
 * @param input - { theme?: 主题ID, accent?: 强调色ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的主题和强调色
 */
export const updateTheme = defineAction({
	input: z.object({
		theme: z.string().optional(),
		accent: z.string().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await updateThemeService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
