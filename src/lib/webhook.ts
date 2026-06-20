/**
 * Webhook 工具模块
 *
 * 提供 Webhook Secret 生成、HMAC-SHA256 签名、Webhook 发送和触发功能。
 * 使用 Web Crypto API（兼容 Cloudflare Workers），不依赖 Node.js 内置 crypto 模块。
 */
import { prisma } from '@/lib/db';

/** Webhook 签名密钥的随机字节长度（32 字节 = 64 十六进制字符） */
const SECRET_BYTES = 32;

/** Webhook 请求超时时间（毫秒） */
const WEBHOOK_TIMEOUT = 10_000;

/** 允许的 Webhook 事件类型 */
export const VALID_WEBHOOK_EVENTS = [
	'notification.follow',
	'notification.comment',
	'notification.like',
	'notification.mention'
] as const;

/** Webhook 事件类型 */
type WebhookEventType = (typeof VALID_WEBHOOK_EVENTS)[number];

/**
 * Webhook 记录类型（从数据库查询的结果）
 */
interface WebhookRecord {
	id: string;
	userId: string;
	url: string;
	secret: string;
	events: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Webhook 发送时的 payload 结构
 */
interface WebhookPayload {
	event: string;
	timestamp: string;
	signature: string;
	data: Record<string, unknown>;
}

/**
 * 生成 Webhook Secret
 *
 * 使用 crypto.getRandomValues 生成 32 字节随机数，
 * 转为 64 字符十六进制字符串作为签名密钥。
 *
 * @returns 十六进制格式的 Secret 字符串（64 字符）
 */
export function generateSecret(): string {
	const bytes = new Uint8Array(SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * HMAC-SHA256 签名
 *
 * 使用 Web Crypto API 对 payload 进行 HMAC-SHA256 签名，
 * 兼容 Cloudflare Workers 运行时。
 * 签名前会校验 secret 格式：必须为偶数长度的十六进制字符串。
 *
 * @param payload - 待签名的 payload 字符串
 * @param secret - HMAC 签名密钥（十六进制字符串，必须为偶数长度且仅含十六进制字符）
 * @returns `sha256=<hex>` 格式的签名字符串
 * @throws secret 格式不合法时抛出错误
 */
async function signPayload(payload: string, secret: string): Promise<string> {
	// 校验 secret 格式：必须为偶数长度
	if (secret.length % 2 !== 0) {
		throw new Error(`Webhook secret 格式错误：长度必须为偶数，当前长度 ${secret.length}`);
	}
	// 校验 secret 格式：必须仅包含十六进制字符
	if (!/^[0-9a-fA-F]+$/.test(secret)) {
		throw new Error('Webhook secret 格式错误：必须仅包含十六进制字符（0-9, a-f, A-F）');
	}

	// 将十六进制 secret 转为 Uint8Array 作为 HMAC 密钥
	const keyBytes = new Uint8Array(secret.length / 2);
	for (let i = 0; i < secret.length; i += 2) {
		keyBytes[i / 2] = parseInt(secret.substring(i, i + 2), 16);
	}

	// 导入 HMAC 密钥
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	// 计算签名
	const encoder = new TextEncoder();
	const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

	// 转为十六进制字符串
	const signatureArray = Array.from(new Uint8Array(signatureBuffer));
	const hex = signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return `sha256=${hex}`;
}

/**
 * 发送 Webhook 请求
 *
 * 构造完整的 Webhook payload（含 event、timestamp、signature、data），
 * 通过 HTTP POST 发送到 webhook.url。
 * 超时 10 秒，失败不抛错（仅记录日志），不影响主流程。
 *
 * @param webhook - Webhook 记录（需包含 url、secret、events）
 * @param event - 触发的事件类型（如 notification.follow）
 * @param data - 事件数据
 */
async function sendWebhook(
	webhook: WebhookRecord,
	event: string,
	data: Record<string, unknown>
): Promise<void> {
	try {
		const timestamp = new Date().toISOString();

		// 构造待签名的 payload 字符串
		const payloadString = JSON.stringify({
			event,
			timestamp,
			data
		});

		// 计算 HMAC-SHA256 签名
		const signature = await signPayload(payloadString, webhook.secret);

		// 构造完整的 Webhook payload
		const payload: WebhookPayload = {
			event,
			timestamp,
			signature,
			data
		};

		// 发送 HTTP POST 请求，设置超时
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

		await fetch(webhook.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Webhook-Signature': signature
			},
			body: JSON.stringify(payload),
			signal: controller.signal
		});

		clearTimeout(timeoutId);
	} catch (error) {
		// Webhook 发送失败不抛错，仅记录日志
		console.error(`Webhook 发送失败 [${webhook.id}] ${webhook.url}:`, error);
	}
}

/**
 * 触发用户的所有匹配 Webhook
 *
 * 查询该用户 isActive=true 且 events 包含该 event 的 Webhook，
 * 逐一调用 sendWebhook。异步执行，不阻塞主流程。
 *
 * @param userId - 接收通知的用户 ID
 * @param event - 触发的事件类型（如 notification.follow）
 * @param data - 事件数据（通知详情）
 */
export async function triggerWebhooks(
	userId: string,
	event: string,
	data: Record<string, unknown>
): Promise<void> {
	try {
		// 查询该用户所有激活的 Webhook
		const webhooks = await prisma.webhook.findMany({
			where: {
				userId,
				isActive: true
			}
		});

		// 筛选出 events 包含该 event 的 Webhook
		const matchedWebhooks = webhooks.filter((wh: { events: string }) => {
			try {
				const events: string[] = JSON.parse(wh.events);
				return events.includes(event);
			} catch {
				return false;
			}
		});

		// 逐一发送，不阻塞主流程
		for (const webhook of matchedWebhooks) {
			// 异步执行，不 await，失败也不影响其他 Webhook
			sendWebhook(webhook, event, data).catch(() => {});
		}
	} catch (error) {
		// 触发 Webhook 失败不抛错，仅记录日志
		console.error('触发 Webhook 失败:', error);
	}
}

// ── 数据库 CRUD 操作 ──

/**
 * 统计用户的 Webhook 数量
 *
 * @param userId - 用户 ID
 * @returns 该用户的 Webhook 数量
 */
export async function countWebhooks(userId: string): Promise<number> {
	return prisma.webhook.count({ where: { userId } });
}

/**
 * 创建 Webhook 数据库记录
 *
 * @param data - Webhook 创建数据（userId, url, secret, events）
 * @returns 创建的 Webhook 记录
 */
export async function createWebhookRecord(data: {
	userId: string;
	url: string;
	secret: string;
	events: string;
}) {
	return prisma.webhook.create({ data });
}

/**
 * 根据 ID 查询 Webhook
 *
 * @param id - Webhook ID
 * @returns Webhook 记录，不存在返回 null
 */
export async function findWebhookById(id: string) {
	return prisma.webhook.findUnique({ where: { id } });
}

/**
 * 更新 Webhook
 *
 * @param id - Webhook ID
 * @param data - 更新数据
 * @returns 更新后的 Webhook 记录
 */
export async function updateWebhookRecord(id: string, data: Record<string, unknown>) {
	return prisma.webhook.update({ where: { id }, data });
}

/**
 * 删除 Webhook
 *
 * @param id - Webhook ID
 * @returns 被删除的 Webhook 记录
 */
export async function deleteWebhookRecord(id: string) {
	return prisma.webhook.delete({ where: { id } });
}
