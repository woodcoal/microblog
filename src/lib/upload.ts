/** 上传文件的校验、私有存储、预约和引用清理。 */
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import sharp from 'sharp';
import { prisma } from './db';
import { UPLOAD_DIR } from './config';
import {
	ATTACHMENT_EXTENSIONS,
	ATTACHMENT_MAX_SIZE,
	IMAGE_EXTENSIONS,
	IMAGE_MAX_SIZE,
	VIDEO_MAX_SIZE
} from './upload-policy';
import type { FileStorage } from '../../generated/prisma/client';

const MIME_MAP: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	mp4: 'video/mp4',
	pdf: 'application/pdf',
	zip: 'application/zip',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	txt: 'text/plain',
	csv: 'text/csv',
	rar: 'application/vnd.rar',
	'7z': 'application/x-7z-compressed'
};
const MP4_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1']);
export const MAX_IMAGE_COUNT = 9;
export type UploadFileType = 'image' | 'video' | 'attachment';

function resolveMimeType(ext: string, fallbackType?: string): string {
	return MIME_MAP[ext] || fallbackType || 'application/octet-stream';
}
async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}
async function ensureUploadDir(subDir: string): Promise<string> {
	const dir = join(UPLOAD_DIR, subDir);
	if (!existsSync(dir)) await mkdir(dir, { recursive: true });
	return dir;
}
function validateMp4(buffer: Buffer): void {
	if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') {
		throw new Error('视频文件不是有效的 MP4');
	}
	const boxSize = buffer.readUInt32BE(0);
	if (boxSize < 16 || boxSize > buffer.length) throw new Error('视频文件不是有效的 MP4');
	const brands: string[] = [];
	for (let offset = 8; offset + 4 <= boxSize; offset += 4)
		brands.push(buffer.toString('ascii', offset, offset + 4));
	if (!brands.some((brand) => MP4_BRANDS.has(brand))) throw new Error('视频 MP4 兼容品牌无效');
}
async function createDisplay(
	buffer: Buffer
): Promise<{ data: Buffer; width: number; height: number }> {
	const image = sharp(buffer, { animated: true, failOn: 'error' }).rotate();
	const source = await image.metadata();
	if (!source.format || !['jpeg', 'png', 'gif', 'webp'].includes(source.format)) {
		throw new Error('图片内容格式无效');
	}
	const display = await image
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 82 })
		.toBuffer({ resolveWithObject: true });
	return { data: display.data, width: display.info.width, height: display.info.height };
}
async function removeIfExists(path: string | null | undefined): Promise<void> {
	if (!path) return;
	const fullPath = join(UPLOAD_DIR, path);
	if (existsSync(fullPath)) await unlink(fullPath);
}

/** 保存并预约前持有一个文件引用。图片生成 WebP 展示副本，原件始终私有。 */
export async function saveFile(
	file: File,
	fileType: UploadFileType
): Promise<{ fileStorage: FileStorage; isNew: boolean }> {
	const originalName = file.name;
	const ext = extname(originalName).toLowerCase().slice(1);
	const allowedExtensions: readonly string[] =
		fileType === 'image'
			? IMAGE_EXTENSIONS
			: fileType === 'video'
				? ['mp4']
				: ATTACHMENT_EXTENSIONS;
	if (!allowedExtensions.includes(ext)) throw new Error(`不支持的文件类型: .${ext}`);
	const maxSize =
		fileType === 'image'
			? IMAGE_MAX_SIZE
			: fileType === 'video'
				? VIDEO_MAX_SIZE
				: ATTACHMENT_MAX_SIZE;
	if (maxSize <= 0 || file.size > maxSize)
		throw new Error(
			`文件大小超过限制，最大 ${Math.floor(Math.max(maxSize, 0) / 1024 / 1024)} MiB`
		);
	if (fileType === 'video' && file.type !== 'video/mp4')
		throw new Error('视频 MIME 必须为 video/mp4');

	const arrayBuffer = await file.arrayBuffer();
	const raw = Buffer.from(arrayBuffer);
	if (fileType === 'video') validateMp4(raw);
	const display = fileType === 'image' ? await createDisplay(raw) : null;
	const md5Hash = await calculateFileHash(arrayBuffer);
	const existing = await prisma.fileStorage.findUnique({ where: { md5Hash } });
	if (existing) {
		if (existing.fileType !== fileType) throw new Error('相同文件不能跨媒体类型复用');
		await prisma.fileStorage.update({
			where: { id: existing.id },
			data: { refCount: { increment: 1 } }
		});
		return { fileStorage: { ...existing, refCount: existing.refCount + 1 }, isNew: false };
	}

	const originalSubDir =
		fileType === 'attachment'
			? 'attachments'
			: fileType === 'image'
				? 'protected/images/original'
				: 'protected/videos';
	const fileName = `${md5Hash}.${ext}`;
	const filePath = `${originalSubDir}/${fileName}`;
	const displayFilePath = display ? `protected/images/display-v1/${md5Hash}.webp` : null;
	try {
		await writeFile(join(await ensureUploadDir(originalSubDir), fileName), raw);
		if (display && displayFilePath)
			await writeFile(
				join(await ensureUploadDir('protected/images/display-v1'), `${md5Hash}.webp`),
				display.data
			);
		const fileStorage = await prisma.fileStorage.create({
			data: {
				md5Hash,
				filePath,
				fileSize: file.size,
				mimeType: fileType === 'video' ? 'video/mp4' : resolveMimeType(ext, file.type),
				fileType,
				refCount: 1,
				...(display
					? {
							displayFilePath,
							displayFileSize: display.data.byteLength,
							displayMimeType: 'image/webp',
							displayWidth: display.width,
							displayHeight: display.height
						}
					: {})
			}
		});
		return { fileStorage, isNew: true };
	} catch (error) {
		await Promise.allSettled([removeIfExists(filePath), removeIfExists(displayFilePath)]);
		throw error;
	}
}

export async function findFileStorageByFilePath(filePath: string): Promise<FileStorage | null> {
	return prisma.fileStorage.findFirst({ where: { filePath } });
}
export function findFileStoragesByIds(ids: string[], select?: Record<string, boolean>) {
	return prisma.fileStorage.findMany({
		where: { id: { in: ids } },
		...(select ? { select } : {})
	});
}
export function findFileStoragesByFilePaths(filePaths: string[], select?: Record<string, boolean>) {
	return prisma.fileStorage.findMany({
		where: { filePath: { in: filePaths } },
		...(select ? { select } : {})
	});
}
export async function deleteFileRef(fileStorageId: string): Promise<void> {
	await prisma.fileStorage.updateMany({
		where: { id: fileStorageId, refCount: { gt: 0 } },
		data: { refCount: { decrement: 1 } }
	});
	await cleanupUnreferencedFiles([fileStorageId]);
}
export async function cleanupUnreferencedFiles(fileStorageIds?: string[]): Promise<number> {
	const files = await prisma.fileStorage.findMany({
		where: {
			refCount: { lte: 0 },
			media: { none: {} },
			uploadReservations: { none: { consumedAt: null, cancelledAt: null } },
			...(fileStorageIds ? { id: { in: [...new Set(fileStorageIds)] } } : {})
		}
	});
	let deleted = 0;
	for (const file of files) {
		try {
			await Promise.all([
				removeIfExists(file.filePath),
				removeIfExists(file.displayFilePath)
			]);
			const result = await prisma.$transaction(async (tx) => {
				await tx.uploadReservation.deleteMany({
					where: {
						fileStorageId: file.id,
						OR: [{ cancelledAt: { not: null } }, { consumedAt: { not: null } }]
					}
				});
				return tx.fileStorage.deleteMany({ where: { id: file.id, refCount: { lte: 0 } } });
			});
			deleted += result.count;
		} catch (error) {
			console.error('清理零引用文件失败:', file.id, error);
		}
	}
	return deleted;
}
export async function cancelUploadReservation(
	userId: string,
	reservationId: string
): Promise<boolean> {
	let fileStorageId: string | undefined;
	const cancelled = await prisma.$transaction(async (tx) => {
		const reservation = await tx.uploadReservation.findFirst({
			where: { id: reservationId, userId, consumedAt: null, cancelledAt: null }
		});
		if (!reservation) return false;
		const result = await tx.uploadReservation.updateMany({
			where: { id: reservation.id, consumedAt: null, cancelledAt: null },
			data: { cancelledAt: new Date() }
		});
		if (result.count !== 1) return false;
		fileStorageId = reservation.fileStorageId;
		await tx.fileStorage.updateMany({
			where: { id: reservation.fileStorageId, refCount: { gt: 0 } },
			data: { refCount: { decrement: 1 } }
		});
		return true;
	});
	if (fileStorageId) await cleanupUnreferencedFiles([fileStorageId]);
	return cancelled;
}
export async function cleanupExpiredUploadReservations(now = new Date()): Promise<number> {
	const expired = await prisma.uploadReservation.findMany({
		where: { expiresAt: { lte: now }, consumedAt: null, cancelledAt: null },
		select: { id: true, userId: true }
	});
	let count = 0;
	for (const reservation of expired)
		if (await cancelUploadReservation(reservation.userId, reservation.id)) count++;
	await cleanupUnreferencedFiles();
	return count;
}
