import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requireApiAuth } from '@/lib/api-v1';
import { ServiceError } from '@/lib/errors';
import { uploadFile } from '@/services/media.service';

/** 版本化 multipart 上传入口；结果返回预约 ID，发帖时传入 mediaIds。 */
export const POST: APIRoute = async (context) => {
	try {
		const auth = await requireApiAuth(context);
		if (auth instanceof Response) return auth;
		const form = await context.request.formData();
		const file = form.get('file');
		const fileType = form.get('fileType') || 'image';
		if (!(file instanceof File)) throw new ServiceError('BAD_REQUEST', 'file 必须是文件');
		if (fileType !== 'image' && fileType !== 'video' && fileType !== 'attachment')
			throw new ServiceError('BAD_REQUEST', 'fileType 无效');
		return jsonResponse(await uploadFile({ userId: auth.userId, file, fileType }), 201);
	} catch (error) { return handleApiError(error); }
};
