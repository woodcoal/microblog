/**
 * Webhook 管理 Actions
 *
 * 提供 Webhook 的创建、更新、删除和密钥查看功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateSecret, VALID_WEBHOOK_EVENTS } from '@/lib/webhook';

/** 每个用户最多创建的 Webhook 数量 */
const MAX_WEBHOOKS_PER_USER = 5;

/**
 * 创建 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 校验 url 和 events 参数
 * 3. 检查用户 Webhook 数量上限
 * 4. 自动生成 secret
 * 5. 存储到数据库
 * 6. 返回完整 Webhook 数据（含明文 secret，仅此一次）
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
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { url, events } = input;

		// 2. 校验 URL 格式
		try {
			const parsedUrl = new URL(url.trim());
			if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
				throw new Error('仅支持 http/https 协议');
			}
		} catch {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: 'URL 格式无效，仅支持 http/https'
			});
		}

		// 校验事件类型合法性
		const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
		if (invalidEvents.length > 0) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `不合法的事件类型: ${invalidEvents.join(', ')}`
			});
		}

		// 3. 检查用户 Webhook 数量上限
		const webhookCount = await prisma.webhook.count({
			where: { userId: currentUser.userId }
		});
		if (webhookCount >= MAX_WEBHOOKS_PER_USER) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `每个用户最多创建 ${MAX_WEBHOOKS_PER_USER} 个 Webhook`
			});
		}

		// 4. 自动生成 secret
		const secret = generateSecret();

		// 5. 存储到数据库
		const webhook = await prisma.webhook.create({
			data: {
				userId: currentUser.userId,
				url: url.trim(),
				secret,
				events: JSON.stringify(events)
			}
		});

		// 6. 返回完整数据（含明文 secret，仅此一次）
		return {
			webhook: {
				...webhook,
				createdAt: webhook.createdAt.toISOString(),
				updatedAt: webhook.updatedAt.toISOString()
			}
		};
	}
});

/**
 * 更新 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Webhook 是否存在并验证所属用户
 * 3. 校验并更新字段（url / events / isActive）
 * 4. 返回更新后的数据
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
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { id, url, events, isActive } = input;

		// 2. 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			throw new ActionError({ code: 'NOT_FOUND', message: 'Webhook 不存在' });
		}

		// 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权修改此 Webhook' });
		}

		// 3. 校验并构建更新数据
		const updateData: Record<string, unknown> = {};

		// 校验 url
		if (url !== undefined) {
			if (!url.trim()) {
				throw new ActionError({ code: 'BAD_REQUEST', message: 'Webhook URL 不能为空' });
			}
			try {
				const parsedUrl = new URL(url.trim());
				if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
					throw new Error('仅支持 http/https 协议');
				}
			} catch {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: 'URL 格式无效，仅支持 http/https'
				});
			}
			updateData.url = url.trim();
		}

		// 校验 events
		if (events !== undefined) {
			if (events.length === 0) {
				throw new ActionError({ code: 'BAD_REQUEST', message: 'events 必须是非空数组' });
			}
			const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
			if (invalidEvents.length > 0) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `不合法的事件类型: ${invalidEvents.join(', ')}`
				});
			}
			updateData.events = JSON.stringify(events);
		}

		// 校验 isActive
		if (isActive !== undefined) {
			updateData.isActive = isActive;
		}

		// 没有需要更新的字段
		if (Object.keys(updateData).length === 0) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '没有需要更新的字段' });
		}

		// 执行更新
		const updatedWebhook = await prisma.webhook.update({
			where: { id },
			data: updateData
		});

		// 返回更新后的数据（secret 脱敏）
		return {
			webhook: {
				...updatedWebhook,
				secret: updatedWebhook.secret.slice(0, 8) + '***',
				createdAt: updatedWebhook.createdAt.toISOString(),
				updatedAt: updatedWebhook.updatedAt.toISOString()
			}
		};
	}
});

/**
 * 删除 Webhook Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Webhook 是否存在并验证所属用户
 * 3. 删除 Webhook 记录
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
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { id } = input;

		// 2. 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			throw new ActionError({ code: 'NOT_FOUND', message: 'Webhook 不存在' });
		}

		// 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权删除此 Webhook' });
		}

		// 3. 删除 Webhook 记录
		await prisma.webhook.delete({ where: { id } });

		return { id };
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

		const { id } = input;

		// 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			throw new ActionError({ code: 'NOT_FOUND', message: 'Webhook 不存在' });
		}

		// 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权查看此 Webhook' });
		}

		return { secret: webhook.secret };
	}
});
