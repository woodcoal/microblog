/**
 * HTML 安全工具。
 *
 * 仅用于把不可信文本插入 HTML 字符串上下文；优先使用 DOM API 设置文本和属性。
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
