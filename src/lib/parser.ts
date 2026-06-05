/**
 * 内容解析工具
 *
 * 从帖子内容中提取 @提及用户名和 #标签#。
 * 供 API 层创建 Mention / PostTag 关联，以及 Markdown 渲染器生成链接。
 */

/**
 * 从内容中提取 @提及的用户名
 *
 * 匹配规则：@ 后跟字母、数字、下划线，长度 3-20 字符。
 * 使用前导边界 (?<!\w) 排除邮箱地址中的 @（如 user@example.com 不会误匹配）。
 * 返回去重后的用户名列表。
 *
 * @param content - 帖子原始内容
 * @returns 去重的用户名数组（不含 @ 前缀）
 */
export function parseMentions(content: string): string[] {
	const matches = content.matchAll(/(?<!\w)@([a-zA-Z0-9_]{3,20})/g);
	const seen = new Set<string>();
	for (const match of matches) {
		seen.add(match[1]);
	}
	return Array.from(seen);
}

/**
 * 从内容中提取 #标签#
 *
 * 匹配规则：#号包裹的内容，内部为中文、字母、数字、下划线，1-30 字符。
 * 两个 # 号之间不能包含空白字符。
 * 返回去重后的标签名列表。
 *
 * @param content - 帖子原始内容
 * @returns 去重的标签名数组（不含 # 包裹符）
 */
export function parseTags(content: string): string[] {
	const matches = content.matchAll(/#([^#\s]{1,30})#/g);
	const seen = new Set<string>();
	for (const match of matches) {
		seen.add(match[1]);
	}
	return Array.from(seen);
}
