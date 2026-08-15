import type { APIRoute } from 'astro';
import { requireAgentAuth, textErrorResponse, textResponse } from '@/lib/agent';
import { ServiceError } from '@/lib/errors';
import { executeUpload } from '@/services/upload.service';

/**
 * 上传并立即设置当前用户头像。
 *
 * @param context - Agent Token 鉴权的 multipart 请求，file 字段必须为图片
 * @returns 新头像受控 URL 的纯文本响应
 */
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireAgentAuth(context);
		if (auth instanceof Response) return auth;
		const file = (await context.request.formData()).get('file');
		const result = await executeUpload({
			userId: auth.userId,
			channel: 'agent',
			purpose: 'avatar',
			file
		});
		return textResponse(`ok: ${result.data.avatarUrl}`, 201);
	} catch (error) {
		if (error instanceof ServiceError) return textErrorResponse(error.message);
		console.error('头像上传失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
