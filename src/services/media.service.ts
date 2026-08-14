/**
 * 媒体处理 Service
 *
 * 编排文件上传的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import {
	cancelUploadReservation,
	cleanupExpiredUploadReservations,
	saveFile,
	type UploadFileType
} from '@/lib/upload';
import { ServiceError } from '@/lib/errors';
import { prisma } from '@/lib/db';

// ── 类型定义 ──

export interface UploadFileInput {
	userId: string;
	file: File;
	fileType?: UploadFileType;
}

export interface UploadFileResult {
	id: string;
	fileStorageId: string;
	reservationId: string;
	expiresAt: string;
	previewUrl: string;
	url: string;
	displayUrl: string;
	originalUrl: string | null;
	fileType: string;
	originalName: string;
	fileSize: number;
}

// ── 业务函数 ──

/**
 * 上传文件
 *
 * 调用 saveFile 保存文件（含去重、类型校验）。请求体大小由解析前门禁统一校验。
 * 返回文件信息。
 */
export async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
	const { userId, file, fileType = 'image' } = input;

	try {
		await cleanupExpiredUploadReservations();
		const { fileStorage } = await saveFile(file, fileType);
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		let reservation;
		try {
			reservation = await prisma.uploadReservation.create({
				data: {
					userId,
					fileStorageId: fileStorage.id,
					originalName: file.name,
					fileType,
					expiresAt
				}
			});
		} catch (error) {
			// reservation 创建失败时回滚 saveFile 已占用的引用。
			const { deleteFileRef } = await import('@/lib/upload');
			await deleteFileRef(fileStorage.id);
			throw error;
		}

		return {
			id: fileStorage.id,
			fileStorageId: fileStorage.id,
			reservationId: reservation.id,
			expiresAt: expiresAt.toISOString(),
			// reservation 在提交前只有上传者可见。提交后 DTO 改为 Media 的受控 URL。
			url: `/media/reservations/${reservation.id}/preview`,
			previewUrl: `/media/reservations/${reservation.id}/preview`,
			displayUrl: `/media/reservations/${reservation.id}/preview`,
			originalUrl:
				fileType === 'image'
					? `/media/reservations/${reservation.id}/preview?original=1`
					: null,
			fileType: fileStorage.fileType,
			originalName: file.name,
			fileSize: fileStorage.fileSize
		};
	} catch (err) {
		throw new ServiceError('BAD_REQUEST', err instanceof Error ? err.message : '文件上传失败');
	}
}

/** 取消本人尚未消费的上传 reservation；重复取消不会重复扣减引用。 */
export async function cancelUpload(userId: string, reservationId: string): Promise<void> {
	const cancelled = await cancelUploadReservation(userId, reservationId);
	if (!cancelled) {
		const reservation = await prisma.uploadReservation.findUnique({
			where: { id: reservationId }
		});
		if (!reservation || reservation.userId !== userId) {
			throw new ServiceError('NOT_FOUND', '上传凭证不存在');
		}
	}
}

/** 将 avatar 等非帖子引用接管 reservation，不改变既有引用计数。 */
export async function consumeStandaloneUpload(
	userId: string,
	reservationId: string
): Promise<void> {
	const consumed = await prisma.uploadReservation.updateMany({
		where: {
			id: reservationId,
			userId,
			consumedAt: null,
			cancelledAt: null,
			expiresAt: { gt: new Date() }
		},
		data: { consumedAt: new Date() }
	});
	if (consumed.count !== 1) throw new ServiceError('BAD_REQUEST', '上传凭证无效');
}
