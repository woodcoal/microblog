/**
 * Webhook 更新和删除 API
 *
 * PUT    /api/webhooks/:id — 更新 Webhook
 * DELETE /api/webhooks/:id — 删除 Webhook
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';
import { VALID_WEBHOOK_EVENTS } from '@/lib/webhook';

/**
 * 更新 Webhook
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Webhook 是否存在
 * 3. 验证是 Webhook 所属用户（只能更新自己的）
 * 4. 校验并更新字段（url / events / isActive）
 * 5. 返回更新后的数据
 *
 * @param context - Astro API 上下文
 * @returns 更新后的 Webhook 数据
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('Webhook ID 不能为空');
		}

		// 2. 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			return jsonErrorResponse('Webhook 不存在', 404);
		}

		// 3. 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			return jsonErrorResponse('无权修改此 Webhook', 403);
		}

		const body = await parseJsonBody(context.request);
		const { url, events, isActive } = body as {
			url?: string;
			events?: string[];
			isActive?: boolean;
		};

		// 4. 校验并构建更新数据
		const updateData: Record<string, unknown> = {};

		// 校验 url
		if (url !== undefined) {
			if (!url.trim()) {
				return jsonErrorResponse('Webhook URL 不能为空');
			}
			try {
				const parsedUrl = new URL(url.trim());
				if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
					throw new Error('仅支持 http/https 协议');
				}
			} catch {
				return jsonErrorResponse('URL 格式无效，仅支持 http/https');
			}
			updateData.url = url.trim();
		}

		// 校验 events
		if (events !== undefined) {
			if (!Array.isArray(events) || events.length === 0) {
				return jsonErrorResponse('events 必须是非空数组');
			}
			const invalidEvents = events.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e as any));
			if (invalidEvents.length > 0) {
				return jsonErrorResponse(`不合法的事件类型: ${invalidEvents.join(', ')}`);
			}
			updateData.events = JSON.stringify(events);
		}

		// 校验 isActive
		if (isActive !== undefined) {
			if (typeof isActive !== 'boolean') {
				return jsonErrorResponse('isActive 必须为布尔值');
			}
			updateData.isActive = isActive;
		}

		// 没有需要更新的字段
		if (Object.keys(updateData).length === 0) {
			return jsonErrorResponse('没有需要更新的字段');
		}

		// 执行更新
		const updatedWebhook = await prisma.webhook.update({
			where: { id },
			data: updateData
		});

		// 5. 返回更新后的数据（secret 脱敏）
		return new Response(
			JSON.stringify(
				successResponse({
					webhook: {
						...updatedWebhook,
						secret: updatedWebhook.secret.slice(0, 8) + '***'
					}
				})
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('更新 Webhook 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 删除 Webhook
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Webhook 是否存在
 * 3. 验证是 Webhook 所属用户（只能删除自己的）
 * 4. 删除 Webhook 记录
 *
 * @param context - Astro API 上下文
 * @returns 被删除的 Webhook ID
 */
export const DELETE: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('Webhook ID 不能为空');
		}

		// 2. 查询 Webhook 是否存在
		const webhook = await prisma.webhook.findUnique({ where: { id } });
		if (!webhook) {
			return jsonErrorResponse('Webhook 不存在', 404);
		}

		// 3. 验证是 Webhook 所属用户
		if (webhook.userId !== currentUser.userId) {
			return jsonErrorResponse('无权删除此 Webhook', 403);
		}

		// 4. 删除 Webhook 记录
		await prisma.webhook.delete({ where: { id } });

		return new Response(JSON.stringify(successResponse({ id })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除 Webhook 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
