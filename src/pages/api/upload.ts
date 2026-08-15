/**
 * 文件上传 API
 *
 * POST /api/upload — 上传文件（需认证）
 *
 * 帖子、论坛和博客编辑器均通过此入口上传，限制在服务重启后读取运行期环境变量。
 */
import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { executeUpload } from '@/services/upload.service';
import { ServiceError } from '@/lib/errors';

export const POST: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}

		// 2. 解析 FormData
		const formData = await context.request.formData();
		const file = formData.get('file') as File | null;
		const fileType = (formData.get('fileType') as string) || 'image';

		// 校验文件是否存在
		// 3. 唯一上传应用接口负责文件和类型校验、存储及 reservation。
		try {
			const result = await executeUpload({
				userId: authResult.userId,
				channel: 'legacy-api',
				purpose: 'media',
				file,
				requestedType: fileType
			});

			return new Response(JSON.stringify(successResponse(result.data)), {
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			});
		} catch (e) {
			if (e instanceof ServiceError) {
				return jsonErrorResponse(e.message);
			}
			throw e;
		}
	} catch (error) {
		console.error('文件上传失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
