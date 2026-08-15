import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { executeUpload } from '@/services/upload.service';

/**
 * 上传并立即设置当前用户头像。
 *
 * @param context - Bearer 鉴权的 multipart 请求，file 字段必须为图片
 * @returns 新头像受控 URL
 */
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const file = (await context.request.formData()).get('file');
		const result = await executeUpload({
			userId: auth.userId,
			channel: 'v1',
			purpose: 'avatar',
			file
		});
		return jsonResponse(result.data, 201);
	} catch (error) {
		return handleApiError(error);
	}
};
