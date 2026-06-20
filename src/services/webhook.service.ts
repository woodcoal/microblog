/**
 * Webhook 管理 Service
 *
 * 编排 Webhook 的创建、更新、删除和密钥查看业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { ServiceError } from '@/lib/errors';
import {
	generateSecret,
	VALID_WEBHOOK_EVENTS,
	countWebhooks,
	createWebhookRecord,
	findWebhookById,
	updateWebhookRecord,
	deleteWebhookRecord
} from '@/lib/webhook';

/** 每个用户最多创建的 Webhook 数量 */
const MAX_WEBHOOKS_PER_USER = 5;

// ── 类型定义 ──

export interface CreateWebhookInput {
	userId: string;
	url: string;
	events: string[];
}

export interface CreateWebhookResult {
	webhook: {
		id: string;
		userId: string;
		url: string;
		secret: string;
		events: string;
		isActive: boolean;
		createdAt: string;
		updatedAt: string;
	};
}

export interface UpdateWebhookInput {
	userId: string;
	id: string;
	url?: string;
	events?: string[];
	isActive?: boolean;
}

export interface UpdateWebhookResult {
	webhook: {
		id: string;
		userId: string;
		url: string;
		secret: string;
		events: string;
		isActive: boolean;
		createdAt: string;
		updatedAt: string;
	};
}

export interface DeleteWebhookInput {
	userId: string;
	id: string;
}

export interface RevealWebhookSecretInput {
	userId: string;
	id: string;
}

// ── 业务函数 ──

/**
 * 创建 Webhook
 *
 * 校验 URL 格式、事件类型合法性、用户 Webhook 数量上限，
 * 自动生成 secret，存储到数据库。
 * 返回完整 Webhook 数据（含明文 secret，仅此一次）。
 *
 * @param input - { userId, url, events }
 * @returns 创建的 Webhook 数据（含明文 secret）
 */
export async function createWebhook(input: CreateWebhookInput): Promise<CreateWebhookResult> {
	const { userId, url, events } = input;

	// 校验 URL 格式
	try {
		const parsedUrl = new URL(url.trim());
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			throw new Error('仅支持 http/https 协议');
		}
	} catch {
		throw new ServiceError('BAD_REQUEST', 'URL 格式无效，仅支持 http/https');
	}

	// 校验事件类型合法性
	const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
	if (invalidEvents.length > 0) {
		throw new ServiceError('BAD_REQUEST', `不合法的事件类型: ${invalidEvents.join(', ')}`);
	}

	// 检查用户 Webhook 数量上限
	const webhookCount = await countWebhooks(userId);
	if (webhookCount >= MAX_WEBHOOKS_PER_USER) {
		throw new ServiceError(
			'BAD_REQUEST',
			`每个用户最多创建 ${MAX_WEBHOOKS_PER_USER} 个 Webhook`
		);
	}

	// 自动生成 secret
	const secret = generateSecret();

	// 存储到数据库
	const webhook = await createWebhookRecord({
		userId,
		url: url.trim(),
		secret,
		events: JSON.stringify(events)
	});

	// 返回完整数据（含明文 secret，仅此一次）
	return {
		webhook: {
			...webhook,
			createdAt: webhook.createdAt.toISOString(),
			updatedAt: webhook.updatedAt.toISOString()
		}
	};
}

/**
 * 更新 Webhook
 *
 * 校验 Webhook 存在且属于当前用户，校验并更新字段（url / events / isActive）。
 * 返回更新后的数据（secret 脱敏）。
 *
 * @param input - { userId, id, url?, events?, isActive? }
 * @returns 更新后的 Webhook 数据（secret 脱敏）
 */
export async function updateWebhook(input: UpdateWebhookInput): Promise<UpdateWebhookResult> {
	const { userId, id, url, events, isActive } = input;

	// 查询 Webhook 是否存在
	const webhook = await findWebhookById(id);
	if (!webhook) {
		throw new ServiceError('NOT_FOUND', 'Webhook 不存在');
	}

	// 验证是 Webhook 所属用户
	if (webhook.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权修改此 Webhook');
	}

	// 校验并构建更新数据
	const updateData: Record<string, unknown> = {};

	// 校验 url
	if (url !== undefined) {
		if (!url.trim()) {
			throw new ServiceError('BAD_REQUEST', 'Webhook URL 不能为空');
		}
		try {
			const parsedUrl = new URL(url.trim());
			if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
				throw new Error('仅支持 http/https 协议');
			}
		} catch {
			throw new ServiceError('BAD_REQUEST', 'URL 格式无效，仅支持 http/https');
		}
		updateData.url = url.trim();
	}

	// 校验 events
	if (events !== undefined) {
		if (events.length === 0) {
			throw new ServiceError('BAD_REQUEST', 'events 必须是非空数组');
		}
		const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
		if (invalidEvents.length > 0) {
			throw new ServiceError('BAD_REQUEST', `不合法的事件类型: ${invalidEvents.join(', ')}`);
		}
		updateData.events = JSON.stringify(events);
	}

	// 校验 isActive
	if (isActive !== undefined) {
		updateData.isActive = isActive;
	}

	// 没有需要更新的字段
	if (Object.keys(updateData).length === 0) {
		throw new ServiceError('BAD_REQUEST', '没有需要更新的字段');
	}

	// 执行更新
	const updatedWebhook = await updateWebhookRecord(id, updateData);

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

/**
 * 删除 Webhook
 *
 * 校验 Webhook 存在且属于当前用户，删除 Webhook 记录。
 *
 * @param input - { userId, id }
 * @returns 被删除的 Webhook ID
 */
export async function deleteWebhook(input: DeleteWebhookInput): Promise<{ id: string }> {
	const { userId, id } = input;

	// 查询 Webhook 是否存在
	const webhook = await findWebhookById(id);
	if (!webhook) {
		throw new ServiceError('NOT_FOUND', 'Webhook 不存在');
	}

	// 验证是 Webhook 所属用户
	if (webhook.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权删除此 Webhook');
	}

	// 删除 Webhook 记录
	await deleteWebhookRecord(id);

	return { id };
}

/**
 * 查看 Webhook 明文 Secret
 *
 * 校验 Webhook 存在且属于当前用户，返回明文 secret。
 *
 * @param input - { userId, id }
 * @returns 明文 secret
 */
export async function revealWebhookSecret(
	input: RevealWebhookSecretInput
): Promise<{ secret: string }> {
	const { userId, id } = input;

	// 查询 Webhook 是否存在
	const webhook = await findWebhookById(id);
	if (!webhook) {
		throw new ServiceError('NOT_FOUND', 'Webhook 不存在');
	}

	// 验证是 Webhook 所属用户
	if (webhook.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权查看此 Webhook');
	}

	return { secret: webhook.secret };
}
