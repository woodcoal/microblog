/**
 * 杂项 Actions
 *
 * 定义 Markdown 预览等杂项服务端 Actions。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { renderFullMarkdown } from '@/lib/markdown';

/** Markdown 内容最大长度 */
const MARKDOWN_MAX_LENGTH = 50000;

/**
 * Markdown 预览渲染 Action
 *
 * 将 Markdown 文本渲染为 HTML，用于编辑器实时预览功能。
 * 需要登录认证，防止未授权滥用。
 * 校验输入为字符串且长度不超过 50000 字符。
 *
 * @param input - { markdown: Markdown 文本 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { html: string } 渲染后的 HTML
 */
const markdownPreview = defineAction({
	input: z.object({
		markdown: z.string().max(MARKDOWN_MAX_LENGTH, `内容不能超过 ${MARKDOWN_MAX_LENGTH} 个字符`)
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { markdown } = input;

		// 2. 渲染 Markdown 为 HTML
		const html = renderFullMarkdown(markdown);

		return { html };
	}
});

export { markdownPreview };
