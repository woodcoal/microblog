/**
 * 杂项 Service
 *
 * 编排 Markdown 渲染等杂项业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { renderFullMarkdown } from '@/lib/markdown';

// ── 类型定义 ──

export interface RenderMarkdownInput {
	markdown: string;
}

export interface RenderMarkdownResult {
	html: string;
}

// ── 业务函数 ──

/**
 * 渲染 Markdown
 *
 * 将 Markdown 文本渲染为安全 HTML，支持完整 Markdown 语法。
 * 内部委托 @/lib/markdown 的 renderFullMarkdown 执行渲染。
 *
 * @param input - { markdown: Markdown 文本 }
 * @returns { html: 渲染后的 HTML }
 */
export function renderMarkdown(input: RenderMarkdownInput): RenderMarkdownResult {
	const { markdown } = input;
	const html = renderFullMarkdown(markdown);
	return { html };
}
