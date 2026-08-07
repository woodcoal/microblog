/**
 * Agent 文件上传 API
 *
 * POST /api/agent/upload — 上传文件（需认证）
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { uploadFile } from '@/services/media.service';
import { ServiceError } from '@/lib/errors';

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
		try {
			const result = await uploadFile({ userId: authResult.userId, file, fileType: 'image' });
			return textResponse(`ok: ${result.url}`, 201);
		} catch (e) {
			if (e instanceof ServiceError) {
				return textErrorResponse(e.message);
			}
			throw e;
		}
	} catch (error) {
		console.error('文件上传失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
