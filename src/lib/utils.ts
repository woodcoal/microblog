/**
 * 公共工具函数库
 *
 * 存放全项目通用的工具函数，避免在各文件中重复定义。
 */

/**
 * 相对时间格式化
 *
 * 将日期转换为人类可读的相对时间字符串。
 * 如"刚刚"、"3分钟前"、"2小时前"、"5天前"。
 * 超过 30 天则显示具体日期。
 * 未来日期（diff < 0）直接返回"刚刚"。
 *
 * @param date - 日期对象
 * @returns 相对时间字符串
 */
export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();

	// 未来日期直接返回"刚刚"
	if (diff < 0) return '刚刚';

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 30) return date.toLocaleDateString('zh-CN');
	if (days > 0) return `${days}天前`;
	if (hours > 0) return `${hours}小时前`;
	if (minutes > 0) return `${minutes}分钟前`;
	return '刚刚';
}

/**
 * 生成标准化的 API 响应
 *
 * @param data - 响应数据
 * @returns 标准化响应对象
 */
export function successResponse<T>(data: T) {
	return { success: true, data };
}

/**
 * 生成标准化的错误响应
 *
 * @param message - 错误信息
 * @param status - HTTP 状态码
 * @returns 标准化错误响应对象
 */
export function errorResponse(message: string, status: number = 400) {
	return { success: false, error: { message, status } };
}

/**
 * 生成 JSON 格式的 HTTP 错误响应
 *
 * 将 errorResponse 的结果包装为 Response 对象，
 * 统一 API 路由中的错误返回格式。
 *
 * @param message - 错误信息
 * @param status - HTTP 状态码
 * @returns Response 对象
 */
export function jsonErrorResponse(message: string, status: number = 400): Response {
	return new Response(JSON.stringify(errorResponse(message, status)), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/**
 * 安全解析请求体 JSON
 *
 * 尝试解析请求体的 JSON 数据，解析失败时抛出带有 400 状态码的错误。
 *
 * @param request - Request 对象
 * @returns 解析后的 JSON 数据
 * @throws JSON 格式错误时抛出可被外层 catch 捕获的错误对象
 */
export async function parseJsonBody(request: Request): Promise<any> {
	try {
		return await request.json();
	} catch {
		throw Object.assign(new Error('请求体 JSON 格式错误'), { status: 400 });
	}
}
