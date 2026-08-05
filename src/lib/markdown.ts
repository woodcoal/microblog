/**
 * 白名单 Markdown 渲染器
 *
 * 仅支持：粗体、斜体、删除线、行内代码、链接、换行
 * 不支持：标题、列表、引用、代码块、图片、表格等
 *
 * 渲染流程：
 * 1. HTML 转义输入（防 XSS）
 * 2. marked 解析（启用 GFM 删除线）
 * 3. 自定义 renderer 限制输出标签
 */
import { marked, Marked } from 'marked';
import { escapeHtml } from '@/lib/html';

/** 允许的 HTML 标签白名单 */
const ALLOWED_TAGS = new Set(['strong', 'em', 'del', 'code', 'a', 'p', 'br', 'span']);

/** 允许的属性白名单 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
	a: new Set(['href', 'title', 'target', 'rel', 'class']),
	span: new Set(['class']),
	code: new Set(['class'])
};

/**
 * 仅允许可安全导航或加载的 URL 协议。
 * 相对 URL 会以站点根地址解析；图片额外允许常见位图 data URL。
 */
function isSafeUrl(value: string, image = false): boolean {
	const normalized = value
		.trim()
		.replace(/&#(?:0*58|x0*3a);|&colon;/gi, ':')
		// eslint-disable-next-line no-control-regex -- 过滤所有不可见 ASCII 控制字符。
		.replace(/[\u0000-\u001f\u007f]/g, '');

	if (image && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(normalized)) {
		return true;
	}

	try {
		const url = new URL(normalized, 'https://local.invalid');
		return image
			? url.protocol === 'http:' || url.protocol === 'https:'
			: ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
	} catch {
		return false;
	}
}

/** 判断标签属性值是否可安全保留。 */
function isSafeAttribute(tag: string, name: string, value: string): boolean {
	if (name === 'href') return tag === 'a' && isSafeUrl(value);
	if (name === 'src') return tag === 'img' && isSafeUrl(value, true);
	return true;
}

/**
 * 清理 HTML，移除白名单之外的标签和属性
 *
 * @param html - 待清理的 HTML 字符串
 * @returns 清理后的安全 HTML
 */
function sanitizeHtml(html: string): string {
	return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
		const tag = tagName.toLowerCase();

		// 关闭标签直接通过
		if (match.startsWith('</')) {
			return ALLOWED_TAGS.has(tag) ? match : '';
		}

		// 非白名单标签，移除标签但保留内容
		if (!ALLOWED_TAGS.has(tag)) {
			return '';
		}

		// 白名单标签，过滤属性
		const allowedAttrSet = ALLOWED_ATTRS[tag];
		if (!allowedAttrSet) {
			return `<${tag}>`;
		}

		// 提取并过滤属性
		const attrRegex = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
		let filteredAttrs = '';
		let attrMatch;
		while ((attrMatch = attrRegex.exec(match)) !== null) {
			const attrName = attrMatch[1].toLowerCase();
			const attrValue = attrMatch[3] ?? attrMatch[4];
			if (allowedAttrSet.has(attrName) && isSafeAttribute(tag, attrName, attrValue)) {
				filteredAttrs += ` ${attrName}="${attrValue}"`;
			}
		}

		return `<${tag}${filteredAttrs}>`;
	});
}

/**
 * 配置 marked 实例
 *
 * 使用 marked.use() 配置自定义 renderer，禁用不支持的语法。
 */
marked.use({
	gfm: true,
	breaks: true,
	renderer: {
		// 禁用标题，转为粗体段落
		heading({ text }) {
			return `<p><strong>${text}</strong></p>`;
		},
		// 禁用代码块，转为行内代码
		code({ text }) {
			return `<p><code>${text}</code></p>`;
		},
		// 禁用引用
		blockquote({ text }) {
			return `<p>${text}</p>`;
		},
		// 禁用列表
		list({ items }) {
			return `<p>${items.map((item) => item.text).join('<br>')}</p>`;
		},
		listitem({ text }) {
			return `${text}<br>`;
		},
		// 链接强制新窗口打开
		link({ href, title, text }) {
			const titleAttr = title ? ` title="${title}"` : '';
			return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		// 禁用图片，显示 alt 文本
		image({ text }) {
			return text;
		},
		// 禁用表格
		tablerow() {
			return '';
		},
		tablecell() {
			return '';
		}
	}
});

/**
 * HTML 实体转义
 *
 * 将 &, <, >, ", ' 转义为对应的 HTML 实体，
 * 防止在动态插入匹配内容时产生 XSS 注入。
 *
 * @param str - 待转义的字符串
 * @returns 转义后的安全字符串
 */
/**
 * 将文本节点中的 @提及 和 #标签# 转为链接
 *
 * 只处理 HTML 标签之外的文本内容，避免误解析标签属性中的 @ 或 #。
 * 处理流程：按 HTML 标签拆分文本，仅对文本段做替换，标签段原样保留。
 *
 * @param html - 经 marked 解析和 sanitize 后的 HTML
 * @returns 链接化后的 HTML
 */
function linkifyMentionsAndTags(html: string): string {
	// 按 HTML 标签拆分：标签段和文本段交替出现
	// 例如 "<p>hello @world</p>" → ["<p>", "hello @world", "</p>"]
	const parts = html.split(/(<[^>]+>)/);

	return parts
		.map((part) => {
			// 标签段原样保留
			if (part.startsWith('<')) return part;

			// 文本段：替换 @username → 链接（对匹配内容做 HTML 转义防 XSS）
			let text = part.replace(
				/@([a-zA-Z0-9_]{3,20})/g,
				(_, name) =>
					`<a href="/${escapeHtml(name)}" class="mention">@${escapeHtml(name)}</a>`
			);

			// 文本段：替换 #tag# → 链接（对匹配内容做 HTML 转义防 XSS）
			text = text.replace(
				/#([^#\s]{1,30})#/g,
				(_, tag) =>
					`<a href="/tags/${escapeHtml(tag)}" class="tag">#${escapeHtml(tag)}#</a>`
			);

			return text;
		})
		.join('');
}

/**
 * 全功能 Markdown 渲染器（独立实例，不受全局受限配置影响）
 *
 * 支持：标题、列表、引用、代码块、图片、链接、表格等完整 Markdown 语法。
 * 用于论坛编辑器预览和博客内容渲染。
 */
const fullMarked = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		// 链接强制新窗口打开
		link({ href, title, text }) {
			const titleAttr = title ? ` title="${title}"` : '';
			return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		// 图片添加样式类
		image({ href, title, text }) {
			const titleAttr = title ? ` title="${title}"` : '';
			return `<img src="${href}" alt="${text}"${titleAttr} />`;
		}
	}
});

/** 全功能渲染允许的标签白名单（比 weibo 版本宽松，支持标题/列表/引用/代码块等） */
const FULL_ALLOWED_TAGS = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'strong',
	'em',
	'del',
	'code',
	'pre',
	'a',
	'img',
	'ul',
	'ol',
	'li',
	'blockquote',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'span',
	'div'
]);

/** 全功能渲染允许的属性白名单 */
const FULL_ALLOWED_ATTRS: Record<string, Set<string>> = {
	a: new Set(['href', 'title', 'target', 'rel', 'class']),
	img: new Set(['src', 'alt', 'title', 'class', 'width', 'height']),
	code: new Set(['class']),
	pre: new Set(['class']),
	span: new Set(['class']),
	td: new Set(['align']),
	th: new Set(['align'])
};

/**
 * 清理 HTML（全功能版），移除白名单之外的标签和属性
 *
 * @param html - 待清理的 HTML 字符串
 * @returns 清理后的安全 HTML
 */
function sanitizeFullHtml(html: string): string {
	return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
		const tag = tagName.toLowerCase();

		// 关闭标签直接通过
		if (match.startsWith('</')) {
			return FULL_ALLOWED_TAGS.has(tag) ? match : '';
		}

		// 非白名单标签，移除标签但保留内容
		if (!FULL_ALLOWED_TAGS.has(tag)) {
			return '';
		}

		// 白名单标签，过滤属性
		const allowedAttrSet = FULL_ALLOWED_ATTRS[tag];
		if (!allowedAttrSet) {
			return `<${tag}>`;
		}

		// 提取并过滤属性
		const attrRegex = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
		let filteredAttrs = '';
		let attrMatch;
		while ((attrMatch = attrRegex.exec(match)) !== null) {
			const attrName = attrMatch[1].toLowerCase();
			const attrValue = attrMatch[3] ?? attrMatch[4];
			if (allowedAttrSet.has(attrName) && isSafeAttribute(tag, attrName, attrValue)) {
				filteredAttrs += ` ${attrName}="${attrValue}"`;
			}
		}

		return `<${tag}${filteredAttrs}>`;
	});
}

/**
 * 渲染完整 Markdown 为安全 HTML（论坛/博客模式使用）
 *
 * 支持标题、列表、引用、代码块、图片、链接、表格等完整 Markdown 语法。
 * 渲染流程与 renderMarkdown 相同，但使用独立的 marked 实例和更宽松的白名单。
 *
 * @param markdown - 原始 Markdown 文本
 * @returns 渲染后的 HTML 字符串
 */
export function renderFullMarkdown(markdown: string): string {
	if (!markdown) return '';

	// 1. 全功能 marked 解析（XSS 防护由后续 sanitizeFullHtml 处理）
	let html = fullMarked.parse(markdown) as string;

	// 2. 清理 HTML，确保只有白名单标签
	html = sanitizeFullHtml(html);

	// 3. 将 @提及 和 #标签# 转为可点击链接
	html = linkifyMentionsAndTags(html);

	return html;
}

/**
 * 渲染 Markdown 为安全 HTML（微博模式，受限白名单）
 *
 * @param markdown - 原始 Markdown 文本
 * @returns 渲染后的 HTML 字符串
 */
export function renderMarkdown(markdown: string): string {
	if (!markdown) return '';

	// 1. HTML 转义输入（防 XSS 注入）
	const escaped = markdown
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

	// 2. marked 解析
	let html = marked.parse(escaped) as string;

	// 3. 清理 HTML，确保只有白名单标签
	html = sanitizeHtml(html);

	// 4. 将 @提及 和 #标签# 转为可点击链接
	html = linkifyMentionsAndTags(html);

	return html;
}
