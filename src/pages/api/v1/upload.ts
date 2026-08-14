import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { executeUpload } from '@/services/upload.service';

/** 版本化 multipart 上传入口；结果返回预约 ID，发帖时传入 mediaIds。 */
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const form = await context.request.formData();
		const file = form.get('file');
		const fileType = form.get('fileType') || 'image';
		const result = await executeUpload({
			userId: auth.userId,
			channel: 'v1',
			purpose: 'media',
			file,
			requestedType: fileType
		});
		return jsonResponse(result.data, 201);
	} catch (error) {
		return handleApiError(error);
	}
};
