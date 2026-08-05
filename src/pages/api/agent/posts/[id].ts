/**
 * Agent 帖子详情 API
 *
 * GET /api/agent/posts/:id — 获取帖子详情（含评论和媒体）
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse, formatPostDetail } from '@/lib/agent';
import { getPostDetail } from '@/services/content.service';

/**
 * 获取帖子详情
 *
 * 参数：comments（0=全部, -1=不返回, >0=数量限制）
 * 评论按时间倒序，回复紧跟父评论按时间倒序。
 * 遵守可见度规则：password 帖子返回提示，users 帖子无权返回提示。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的帖子详情
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return textErrorResponse('帖子标识不能为空');
		}

		// 解析 comments 参数
		const url = new URL(context.request.url);
		const commentsParam = Number(url.searchParams.get('comments')) || 0;

		// 委托 service 层查询
		const result = await getPostDetail({
			userId: currentUser.userId,
			postId: id,
			commentsParam
		});

		// 处理错误情况
		if ('error' in result) {
			return textErrorResponse(result.error ?? '未知错误', result.status);
		}

		return textResponse(formatPostDetail(result.data.post, result.data.comments));
	} catch (error) {
		console.error('获取帖子详情失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
