/**
 * Agent 文件上传 API
 *
 * POST /api/agent/upload — 上传文件（需认证）
 * 默认只支持图片上传，返回图片 URL。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { saveFile } from '@/lib/upload';

/**
 * 处理文件上传请求
 *
 * 接收 multipart/form-data，file 字段为上传文件。
 * Agent API 默认上传类型为 image。
 * 成功返回 `ok: /uploads/xxx.jpg`，失败返回 `error: 原因`。
 *
 * @param context - Astro API 上下文
 * @returns 上传结果纯文本
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		// 解析 FormData
		const formData = await context.request.formData();
		const file = formData.get('file') as File | null;

		if (!file) {
			return textErrorResponse('请选择要上传的文件');
		}

		// Agent API 默认只支持图片上传
		const { fileStorage } = await saveFile(file, 'image');

		return textResponse(`ok: /uploads/${fileStorage.filePath}`, 201);
	} catch (error) {
		// 区分业务错误和系统错误
		const message = error instanceof Error ? error.message : '上传失败';
		const isBusinessError =
			message.includes('不支持的文件类型') || message.includes('文件大小超过限制');

		if (isBusinessError) {
			return textErrorResponse(message);
		}

		console.error('文件上传失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
