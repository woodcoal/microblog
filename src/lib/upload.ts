/**
 * 文件上传工具函数
 *
 * 提供文件 MD5 计算、文件存储（去重）、引用计数管理等功能。
 * 图片使用 MD5 哈希命名实现去重，附件保留原始文件名。
 * 通过 refCount 引用计数管理文件生命周期，归零时自动删除物理文件。
 */
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { prisma } from './db';
import { UPLOAD_DIR } from './config';
import type { FileStorage } from '../../generated/prisma/client';

/** 文件扩展名到 MIME 类型的映射表（基于扩展名而非客户端声明） */
const MIME_MAP: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
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

/**
 * 根据文件扩展名解析 MIME 类型
 *
 * 优先从 MIME_MAP 映射表查找，避免信任客户端提供的 Content-Type。
 * 扩展名不在映射中时回退到 file.type 或 'application/octet-stream'。
 *
 * @param ext - 文件扩展名（不含点号，小写）
 * @param fallbackType - 客户端声明的 MIME 类型，作为回退
 * @returns MIME 类型字符串
 */
function resolveMimeType(ext: string, fallbackType?: string): string {
	return MIME_MAP[ext] || fallbackType || 'application/octet-stream';
}

/** 图片允许的扩展名白名单 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/** 附件允许的扩展名白名单 */
const ATTACHMENT_EXTENSIONS = [
	'pdf',
	'zip',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'txt',
	'csv',
	'rar',
	'7z'
];

/** 图片最大文件大小：5MB */
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

/** 附件最大文件大小：20MB */
const ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

/** 图片最大数量 */
export const MAX_IMAGE_COUNT = 9;

/**
 * 计算文件内容的哈希值
 *
 * 使用 Web Crypto API 的 crypto.subtle.digest 计算 SHA-256，
 * 再将结果转为十六进制字符串作为文件指纹。
 * 用于文件去重的唯一标识。
 *
 * @param buffer - 文件的 ArrayBuffer 数据
 * @returns 十六进制格式的哈希字符串
 */
async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 确保上传目录存在
 *
 * 检查 UPLOAD_DIR 是否存在，不存在则递归创建。
 * 同时按文件类型创建子目录（images / attachments）。
 *
 * @param subDir - 子目录名（images 或 attachments）
 */
async function ensureUploadDir(subDir: string): Promise<string> {
	const dir = join(UPLOAD_DIR, subDir);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
	return dir;
}

/**
 * 保存上传文件
 *
 * 完整流程：
 * 1. 校验文件类型（扩展名白名单）
 * 2. 校验文件大小
 * 3. 计算文件哈希，查询是否已存在相同文件
 * 4. 已存在：refCount + 1，返回已有记录
 * 5. 不存在：存储文件到 UPLOAD_DIR，创建 FileStorage 记录
 * 6. 图片文件名用哈希 + 原始扩展名，附件保留原始文件名
 *
 * @param file - 上传的 File 对象
 * @param fileType - 文件类型：'image' 或 'attachment'
 * @returns 文件存储记录和是否为新文件的标记
 * @throws 文件类型不允许、文件过大等错误
 */
export async function saveFile(
	file: File,
	fileType: 'image' | 'attachment'
): Promise<{ fileStorage: FileStorage; isNew: boolean }> {
	// 提取原始文件名和扩展名
	const originalName = file.name;
	const ext = extname(originalName).toLowerCase().slice(1);

	// 校验文件类型
	const allowedExtensions = fileType === 'image' ? IMAGE_EXTENSIONS : ATTACHMENT_EXTENSIONS;
	if (!allowedExtensions.includes(ext)) {
		throw new Error(`不支持的文件类型: .${ext}，允许的类型: ${allowedExtensions.join(', ')}`);
	}

	// 校验文件大小
	const maxSize = fileType === 'image' ? IMAGE_MAX_SIZE : ATTACHMENT_MAX_SIZE;
	if (file.size > maxSize) {
		const maxMB = fileType === 'image' ? '5MB' : '20MB';
		throw new Error(`文件大小超过限制，${fileType === 'image' ? '图片' : '附件'}最大 ${maxMB}`);
	}

	// 读取文件内容并计算哈希
	const arrayBuffer = await file.arrayBuffer();
	const md5Hash = await calculateFileHash(arrayBuffer);

	// 查询是否已存在相同哈希的文件
	const existing = await prisma.fileStorage.findUnique({
		where: { md5Hash }
	});

	if (existing) {
		if (existing.fileType !== fileType) {
			throw new Error('相同文件已按其他用途上传，不能跨图片与附件类型复用');
		}
		// 已存在：引用计数 +1
		await prisma.fileStorage.update({
			where: { id: existing.id },
			data: { refCount: { increment: 1 } }
		});
		return { fileStorage: { ...existing, refCount: existing.refCount + 1 }, isNew: false };
	}

	// 确定存储子目录
	const subDir = fileType === 'image' ? 'images' : 'attachments';
	const dir = await ensureUploadDir(subDir);

	// 磁盘文件名只使用服务端哈希，原始文件名仅保存在 reservation/Media 中。
	const fileName = `${md5Hash}.${ext}`;
	const filePath = join(subDir, fileName).split('\\').join('/');

	// 写入物理文件
	await writeFile(join(dir, fileName), Buffer.from(arrayBuffer));

	// 创建 FileStorage 数据库记录
	const fileStorage = await prisma.fileStorage.create({
		data: {
			md5Hash,
			filePath,
			fileSize: file.size,
			mimeType: resolveMimeType(ext, file.type),
			fileType,
			refCount: 1
		}
	});

	return { fileStorage, isNew: true };
}

/**
 * 按文件路径查询 FileStorage 记录
 *
 * 根据文件存储路径查找对应的数据库记录，用于文件引用管理。
 *
 * @param filePath - 文件存储路径（相对路径，如 images/xxx.jpg）
 * @returns FileStorage 记录，不存在则返回 null
 */
export async function findFileStorageByFilePath(filePath: string): Promise<FileStorage | null> {
	return prisma.fileStorage.findFirst({
		where: { filePath }
	});
}

/**
 * 按 ID 列表查询 FileStorage 记录
 *
 * @param ids - FileStorage ID 列表
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的 FileStorage 记录列表
 */
export function findFileStoragesByIds(ids: string[], select?: Record<string, boolean>) {
	return prisma.fileStorage.findMany({
		where: { id: { in: ids } },
		...(select ? { select } : {})
	});
}

/**
 * 按文件路径列表查询 FileStorage 记录
 *
 * @param filePaths - 文件路径列表
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的 FileStorage 记录列表
 */
export function findFileStoragesByFilePaths(filePaths: string[], select?: Record<string, boolean>) {
	return prisma.fileStorage.findMany({
		where: { filePath: { in: filePaths } },
		...(select ? { select } : {})
	});
}

/**
 * 删除文件引用（原子操作，避免并发竞态）
 *
 * 使用 Prisma 原子 decrement 操作将 refCount 减 1，
 * 然后重新查询判断是否归零需要删除。
 * 避免了"先读后改"模式下的并发竞态条件。
 *
 * @param fileStorageId - FileStorage 记录 ID
 */
export async function deleteFileRef(fileStorageId: string): Promise<void> {
	await prisma.fileStorage.updateMany({
		where: { id: fileStorageId, refCount: { gt: 0 } },
		data: { refCount: { decrement: 1 } }
	});
	await cleanupUnreferencedFiles([fileStorageId]);
}

/** 在数据库引用已提交为零后删除物理文件；失败时保留记录供下次重试。 */
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
			const fullPath = join(UPLOAD_DIR, file.filePath);
			if (existsSync(fullPath)) await unlink(fullPath);
			const result = await prisma.$transaction(async (tx) => {
				// reservation 已取消或已消费后不再拥有引用，可随零引用文件清理。
				await tx.uploadReservation.deleteMany({
					where: {
						fileStorageId: file.id,
						OR: [{ cancelledAt: { not: null } }, { consumedAt: { not: null } }]
					}
				});
				return tx.fileStorage.deleteMany({
					where: { id: file.id, refCount: { lte: 0 } }
				});
			});
			deleted += result.count;
		} catch (err) {
			console.error('清理零引用文件失败:', file.id, err);
		}
	}
	return deleted;
}

/** 取消指定用户尚未消费的 reservation，并原子释放其文件引用。 */
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

/** 机会式清理已过期 reservation；重复调用是幂等的。 */
export async function cleanupExpiredUploadReservations(now = new Date()): Promise<number> {
	const expired = await prisma.uploadReservation.findMany({
		where: { expiresAt: { lte: now }, consumedAt: null, cancelledAt: null },
		select: { id: true, userId: true }
	});
	let count = 0;
	for (const reservation of expired) {
		if (await cancelUploadReservation(reservation.userId, reservation.id)) count++;
	}
	await cleanupUnreferencedFiles();
	return count;
}
