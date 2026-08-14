import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';

export const MAX_BLOG_ATTACHMENTS = 10;
export const MAX_BLOG_ATTACHMENTS_SIZE = 100 * 1024 * 1024;

export interface PostAssetMediaItem {
	fileStorageId: string;
	fileType: string;
	originalName?: string;
	sortOrder: number;
	slot?: string | null;
	reservationId?: string;
}

interface CurrentMedia {
	id: string;
	fileStorageId: string;
	fileType: string;
	originalName: string;
	sortOrder: number;
	slot: string | null;
}

interface ResolveInput {
	userId: string;
	mode: string;
	bodyFileStorageIds: string[];
	thumbnailFileStorageId?: string | null;
	attachmentFileStorageIds?: string[];
	currentMedia?: CurrentMedia[];
	preserveBody?: boolean;
	preserveThumbnail?: boolean;
	preserveAttachments?: boolean;
	legacyBodyFileStorageIds?: Set<string>;
}

/** 解析并验证帖子媒体；所有新增文件必须由当前用户的有效 reservation 授权。 */
export async function resolvePostAssets(input: ResolveInput): Promise<PostAssetMediaItem[]> {
	const current = input.currentMedia || [];
	const currentBody = current.filter(
		(m) => m.slot === null && (m.fileType === 'image' || m.fileType === 'video')
	);
	const currentThumbnail = current.find((m) => m.slot === 'thumbnail');
	const currentAttachments = current.filter(
		(m) => m.slot === null && m.fileType === 'attachment'
	);

	const requestedBody = input.preserveBody
		? currentBody.map((m) => m.fileStorageId)
		: input.bodyFileStorageIds;
	const requestedThumbnail = input.preserveThumbnail
		? currentThumbnail?.fileStorageId || null
		: input.thumbnailFileStorageId || null;
	const requestedAttachments = input.preserveAttachments
		? currentAttachments.map((m) => m.fileStorageId)
		: input.attachmentFileStorageIds || [];

	if (input.mode !== 'blog' && (requestedThumbnail || requestedAttachments.length > 0)) {
		throw new ServiceError('BAD_REQUEST', '仅博客模式支持缩略图和附件');
	}
	if (requestedAttachments.length > MAX_BLOG_ATTACHMENTS) {
		throw new ServiceError('BAD_REQUEST', `附件最多 ${MAX_BLOG_ATTACHMENTS} 个`);
	}
	if (input.mode !== 'weibo' && requestedBody.some((id) => id)) {
		// 论坛和博客继续只有图片正文；视频只属于微博，避免扩大既有资产模型。
		const bodyFiles = await prisma.fileStorage.findMany({ where: { id: { in: requestedBody } } });
		if (bodyFiles.some((file) => file.fileType === 'video'))
			throw new ServiceError('BAD_REQUEST', '仅微博支持视频');
	}

	const roleIds = [
		...requestedBody,
		...(requestedThumbnail ? [requestedThumbnail] : []),
		...requestedAttachments
	];
	if (new Set(roleIds).size !== roleIds.length) {
		throw new ServiceError('BAD_REQUEST', '同一文件不能同时作为正文、缩略图或附件');
	}
	if (roleIds.length === 0) return [];

	const files = await prisma.fileStorage.findMany({ where: { id: { in: roleIds } } });
	if (files.length !== roleIds.length) throw new ServiceError('BAD_REQUEST', '部分文件不存在');
	const fileById = new Map(files.map((file) => [file.id, file]));
	if (requestedBody.some((id) => !['image', 'video'].includes(fileById.get(id)?.fileType || ''))) {
		throw new ServiceError('BAD_REQUEST', '正文媒体只能使用图片或视频');
	}
	const videoCount = requestedBody.filter((id) => fileById.get(id)?.fileType === 'video').length;
	const imageCount = requestedBody.length - videoCount;
	if (videoCount > 1 || (videoCount > 0 && imageCount > 0)) {
		throw new ServiceError('BAD_REQUEST', '微博只能发布 0–9 张图片或一个视频');
	}
	if (requestedThumbnail && fileById.get(requestedThumbnail)?.fileType !== 'image') {
		throw new ServiceError('BAD_REQUEST', '缩略图必须是图片');
	}
	if (requestedAttachments.some((id) => fileById.get(id)?.fileType !== 'attachment')) {
		throw new ServiceError('BAD_REQUEST', '附件文件类型无效');
	}
	const attachmentSize = requestedAttachments.reduce(
		(sum, id) => sum + (fileById.get(id)?.fileSize || 0),
		0
	);
	if (attachmentSize > MAX_BLOG_ATTACHMENTS_SIZE) {
		throw new ServiceError('BAD_REQUEST', '附件总大小不能超过 100 MiB');
	}

	const currentKeys = new Set(current.map((m) => `${m.slot || ''}:${m.fileStorageId}`));
	const desired = [
		...requestedBody.map((fileStorageId, sortOrder) => ({
			fileStorageId,
			fileType: fileById.get(fileStorageId)?.fileType || 'image',
			sortOrder,
			slot: null as string | null
		})),
		...(requestedThumbnail
			? [
					{
						fileStorageId: requestedThumbnail,
						fileType: 'image',
						sortOrder: 0,
						slot: 'thumbnail'
					}
				]
			: []),
		...requestedAttachments.map((fileStorageId, sortOrder) => ({
			fileStorageId,
			fileType: 'attachment',
			sortOrder,
			slot: null as string | null
		}))
	];
	const needsReservation = desired.filter(
		(item) => !currentKeys.has(`${item.slot || ''}:${item.fileStorageId}`)
	);
	const reservations = await prisma.uploadReservation.findMany({
		where: {
			userId: input.userId,
			fileStorageId: { in: needsReservation.map((item) => item.fileStorageId) },
			expiresAt: { gt: new Date() },
			consumedAt: null,
			cancelledAt: null
		},
		orderBy: { createdAt: 'asc' }
	});
	const reservationByFile = new Map<string, (typeof reservations)[number]>();
	for (const reservation of reservations) {
		if (!reservationByFile.has(reservation.fileStorageId)) {
			reservationByFile.set(reservation.fileStorageId, reservation);
		}
	}
	if (
		needsReservation.some(
			(item) =>
				!reservationByFile.has(item.fileStorageId) &&
				!input.legacyBodyFileStorageIds?.has(item.fileStorageId)
		)
	) {
		throw new ServiceError('BAD_REQUEST', '文件上传凭证无效、已过期或不属于当前用户');
	}

	return desired.map((item) => {
		const existing = current.find(
			(m) =>
				m.fileStorageId === item.fileStorageId && (m.slot || null) === (item.slot || null)
		);
		const reservation = reservationByFile.get(item.fileStorageId);
		return {
			...item,
			originalName:
				item.fileType === 'attachment'
					? reservation?.originalName || existing?.originalName || 'attachment'
					: '',
			...(reservation ? { reservationId: reservation.id } : {})
		};
	});
}
