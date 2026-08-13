/**
 * Webhook 管理 Actions
 *
 * 提供 Webhook 的创建、更新、删除和密钥查看功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	createWebhook as createWebhookService,
	updateWebhook as updateWebhookService,
	deleteWebhook as deleteWebhookService,
	revealWebhookSecret as revealWebhookSecretService
} from '@/services/webhook.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(e.code), message: e.message });
	}
	throw e;
}

/**
 * 创建 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 调用 service 校验参数并创建 Webhook
 * 3. 返回完整 Webhook 数据（含明文 secret，仅此一次）
 *
 * @param input - { url: Webhook URL, events: 事件类型数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的 Webhook 数据（含明文 secret，仅此一次）
 */
export const createWebhook = defineAction({
	input: z.object({
		url: z.string().min(1, 'Webhook URL 不能为空'),
		events: z.array(z.string()).min(1, '请至少选择一个事件类型')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await createWebhookService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 更新 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 调用 service 校验并更新字段
 * 3. 返回更新后的数据（secret 脱敏）
 *
 * @param input - { id: Webhook ID, url?: URL, events?: 事件数组, isActive?: 启用状态 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的 Webhook 数据（secret 脱敏）
 */
export const updateWebhook = defineAction({
	input: z.object({
		id: z.string().min(1, 'Webhook ID 不能为空'),
		url: z.string().optional(),
		events: z.array(z.string()).optional(),
		isActive: z.boolean().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await updateWebhookService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 删除 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 调用 service 校验并删除 Webhook
 *
 * @param input - { id: Webhook ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 被删除的 Webhook ID
 */
export const deleteWebhook = defineAction({
	input: z.object({
		id: z.string().min(1, 'Webhook ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await deleteWebhookService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 查看 Webhook 明文 Secret Action
 *
 * 调用后返回 Webhook 的明文密钥，需验证登录和所属用户。
 *
 * @param input - { id: Webhook ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 明文 secret
 */
export const revealWebhookSecret = defineAction({
	input: z.object({
		id: z.string().min(1, 'Webhook ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await revealWebhookSecretService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
