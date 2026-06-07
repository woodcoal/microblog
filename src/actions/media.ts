/**
 * 媒体处理 Actions
 *
 * 提供文件上传功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

/**
 * 上传媒体文件 Action
 *
 * 接收 FormData 形式的文件上传，支持图片和附件。
 * 使用 FormData 输入以支持文件上传，内部调用 saveFile 处理去重和存储。
 * 需要登录认证。
 *
 * @param input - FormData，包含 file（文件）和 fileType（类型）字段
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { id: string, url: string, fileType: string, originalName: string, fileSize: number } 文件信息
 */
export const uploadMedia = defineAction({
	accept: 'form',
	input: z.object({
		file: z.instanceof(File),
		fileType: z.enum(['image', 'attachment']).optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { file, fileType = 'image' } = input;

		// 2. 调用 saveFile 保存文件（含去重、大小校验、类型校验）
		let fileStorage;
		try {
			const result = await saveFile(file, fileType);
			fileStorage = result.fileStorage;
		} catch (err: any) {
			// saveFile 抛出的业务错误（文件类型不允许、大小超限等）转为 ActionError
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: err.message || '文件上传失败'
			});
		}

		// 3. 返回文件信息（filePath 中的反斜杠替换为正斜杠，确保 URL 在所有平台正确）
		return {
			id: fileStorage.id,
			url: `/uploads/${fileStorage.filePath.split('\\').join('/')}`,
			fileType: fileStorage.fileType,
			originalName: file.name,
			fileSize: fileStorage.fileSize
		};
	}
});
