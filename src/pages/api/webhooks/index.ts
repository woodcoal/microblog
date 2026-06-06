/**
 * Webhook 列表和创建 API
 *
 * GET  /api/webhooks — 获取当前用户的 Webhook 列表
 * POST /api/webhooks — 创建新 Webhook
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';
import { generateSecret, VALID_WEBHOOK_EVENTS } from '@/lib/webhook';

/** 每个用户最多创建的 Webhook 数量 */
const MAX_WEBHOOKS_PER_USER = 5;

/**
 * 获取当前用户的 Webhook 列表
 *
 * 返回当前用户所有 Webhook，secret 脱敏显示（仅显示前 8 位 + ***）。
 *
 * @param context - Astro API 上下文
 * @returns Webhook 列表
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 查询当前用户的所有 Webhook
		const webhooks = await prisma.webhook.findMany({
			where: { userId: currentUser.userId },
			orderBy: { createdAt: 'desc' }
		});

		// secret 脱敏：仅显示前 8 位 + ***
		const sanitizedWebhooks = webhooks.map(
			(wh: { secret: string } & Record<string, unknown>) => ({
				...wh,
				secret: wh.secret.slice(0, 8) + '***'
			})
		);

		return new Response(JSON.stringify(successResponse({ webhooks: sanitizedWebhooks })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取 Webhook 列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 创建新 Webhook
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 校验 url 和 events 参数
 * 3. 检查用户 Webhook 数量上限
 * 4. 自动生成 secret
 * 5. 存储到数据库
 * 6. 返回完整 Webhook 数据（含明文 secret，仅此一次）
 *
 * @param context - Astro API 上下文
 * @returns 创建的 Webhook 数据（含明文 secret，仅此一次）
 */
export const POST: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { url, events } = body as { url?: string; events?: string[] };

		// 2. 校验 url 参数
		if (!url || !url.trim()) {
			return jsonErrorResponse('Webhook URL 不能为空');
		}

		// URL 必须是有效的 http/https URL
		try {
			const parsedUrl = new URL(url.trim());
			if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
				throw new Error('仅支持 http/https 协议');
			}
		} catch {
			return jsonErrorResponse('URL 格式无效，仅支持 http/https');
		}

		// 校验 events 参数
		if (!Array.isArray(events) || events.length === 0) {
			return jsonErrorResponse('events 必须是非空数组');
		}

		// 每个事件类型必须合法
		const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
		if (invalidEvents.length > 0) {
			return jsonErrorResponse(`不合法的事件类型: ${invalidEvents.join(', ')}`);
		}

		// 3. 检查用户 Webhook 数量上限
		const webhookCount = await prisma.webhook.count({
			where: { userId: currentUser.userId }
		});
		if (webhookCount >= MAX_WEBHOOKS_PER_USER) {
			return jsonErrorResponse(`每个用户最多创建 ${MAX_WEBHOOKS_PER_USER} 个 Webhook`);
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
		return new Response(JSON.stringify(successResponse({ webhook })), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('创建 Webhook 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
