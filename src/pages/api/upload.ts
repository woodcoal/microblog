/**
 * 文件上传 API
 *
 * POST /api/upload — 上传文件（需认证）
 * 接收 FormData，支持图片和附件两种类型。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { saveFile } from '@/lib/upload';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 处理文件上传请求
 *
 * 流程：
 * 1. 验证用户登录状态
 * 2. 从 FormData 中提取文件和文件类型
 * 3. 校验图片数量限制
 * 4. 调用 saveFile 保存文件
 * 5. 返回文件信息（id, url, fileType, originalName, fileSize）
 *
 * @param context - Astro API 上下文
 * @returns 上传结果或错误
 */
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
		if (!file) {
			return jsonErrorResponse('请选择要上传的文件');
		}

		// 校验文件类型参数
		if (fileType !== 'image' && fileType !== 'attachment') {
			return jsonErrorResponse('文件类型参数无效');
		}

		// 3. 调用 saveFile 保存文件
		const { fileStorage } = await saveFile(file, fileType as 'image' | 'attachment');

		// 4. 返回文件信息（filePath 中的反斜杠替换为正斜杠，确保 URL 在所有平台正确）
		return new Response(
			JSON.stringify(
				successResponse({
					id: fileStorage.id,
					url: `/uploads/${fileStorage.filePath.split('\\').join('/')}`,
					fileType: fileStorage.fileType,
					originalName: file.name,
					fileSize: fileStorage.fileSize
				})
			),
			{ status: 201, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		// 区分业务错误和系统错误
		const message = error instanceof Error ? error.message : '上传失败';
		const isBusinessError =
			message.includes('不支持的文件类型') || message.includes('文件大小超过限制');

		if (isBusinessError) {
			return jsonErrorResponse(message);
		}

		console.error('文件上传失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
