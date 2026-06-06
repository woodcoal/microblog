/**
 * Markdown 预览渲染 API
 *
 * POST /api/markdown-preview — 将 Markdown 文本渲染为 HTML
 * 用于论坛编辑器实时预览功能，支持完整 Markdown 语法。
 * 需要登录认证，防止未授权滥用。
 */
import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { renderFullMarkdown } from '@/lib/markdown';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 处理 Markdown 预览渲染请求
 *
 * @param context - Astro API 上下文
 * @returns 渲染后的 HTML 或错误响应
 */
export const POST: APIRoute = async (context) => {
	try {
		// 验证登录状态（预览功能仅限已登录用户）
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			return jsonErrorResponse('未登录', 401);
		}

		// 解析请求体
		const body = await context.request.json();
		const markdown = body.markdown;

		// 参数校验
		if (typeof markdown !== 'string') {
			return jsonErrorResponse('markdown 参数必须为字符串', 400);
		}

		// 长度限制，防止恶意大文本
		if (markdown.length > 50000) {
			return jsonErrorResponse('内容过长', 400);
		}

		// 渲染 Markdown 为 HTML
		const html = renderFullMarkdown(markdown);

		return new Response(JSON.stringify(successResponse({ html })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		return jsonErrorResponse('渲染失败', 500);
	}
};
