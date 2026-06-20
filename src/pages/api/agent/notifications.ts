/**
 * Agent 通知 API
 *
 * GET /api/agent/notifications — 获取通知列表
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import {
	requireAgentAuth,
	textResponse,
	textErrorResponse,
	parsePagination,
	formatNotificationItem
} from '@/lib/agent';
import { getAgentNotifications } from '@/services/notification.service';

/** 合法的通知类型 */
const VALID_TYPES = ['comment', 'like', 'follow', 'mention'];

/**
 * 获取通知列表
 *
 * 参数：limit, from(ISO), to(ISO), status(all/read/unread), type, sort(latest/earliest), page
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的通知列表
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const url = new URL(context.request.url);
		const fromStr = url.searchParams.get('from');
		const toStr = url.searchParams.get('to');
		const status = url.searchParams.get('status') || 'all';
		const type = url.searchParams.get('type') || undefined;
		const sort = url.searchParams.get('sort') || 'latest';
		const { limit, skip } = parsePagination(url);

		// 验证 type 参数
		if (type && !VALID_TYPES.includes(type)) {
			return textErrorResponse(`通知类型必须为: ${VALID_TYPES.join(', ')}`);
		}

		// 验证 status 参数
		if (status !== 'all' && status !== 'read' && status !== 'unread') {
			return textErrorResponse('status 必须为 all、read 或 unread');
		}

		// 时间范围解析
		let from: Date | undefined;
		let to: Date | undefined;
		if (fromStr) {
			from = new Date(fromStr);
			if (isNaN(from.getTime())) return textErrorResponse('起始时间格式无效');
		}
		if (toStr) {
			to = new Date(toStr);
			if (isNaN(to.getTime())) return textErrorResponse('结束时间格式无效');
		}

		// 通过 service 查询通知
		const notifications = await getAgentNotifications({
			recipientId: currentUser.userId,
			status,
			type,
			from,
			to,
			sort,
			skip,
			limit
		});

		// 格式化输出
		const lines = notifications.map((n) => formatNotificationItem(n));
		return textResponse(lines.join('\n'));
	} catch (error) {
		console.error('获取通知列表失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
