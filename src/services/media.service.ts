/**
 * 媒体处理 Service
 *
 * 编排文件上传的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { saveFile } from '@/lib/upload';
import { ServiceError } from '@/lib/errors';

// ── 类型定义 ──

export interface UploadFileInput {
	file: File;
	fileType?: 'image' | 'attachment';
}

export interface UploadFileResult {
	id: string;
	url: string;
	fileType: string;
	originalName: string;
	fileSize: number;
}

// ── 业务函数 ──

/**
 * 上传文件
 *
 * 调用 saveFile 保存文件（含去重、大小校验、类型校验）。
 * 返回文件信息。
 */
export async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
	const { file, fileType = 'image' } = input;

	try {
		const { fileStorage } = await saveFile(file, fileType);

		return {
			id: fileStorage.id,
			url: `/uploads/${fileStorage.filePath.split('\\').join('/')}`,
			fileType: fileStorage.fileType,
			originalName: file.name,
			fileSize: fileStorage.fileSize
		};
	} catch (err) {
		throw new ServiceError('BAD_REQUEST', err instanceof Error ? err.message : '文件上传失败');
	}
}
