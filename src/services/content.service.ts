/**
 * 内容管理 Service
 *
 * 编排帖子、评论的创建、更新、删除业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import {
	findPostById,
	findPostWithRelations,
	findMediaByPostId,
	findAgentPosts,
	findAgentPostDetail,
	createPostTransaction,
	updatePostTransaction,
	softDeletePost
} from '@/lib/post';
import {
	findCommentById,
	findAgentPostComments,
	createCommentWithActivity,
	softDeleteComment
} from '@/lib/comment';
import {
	cleanupExpiredUploadReservations,
	cleanupUnreferencedFiles,
	findFileStoragesByIds,
	MAX_IMAGE_COUNT
} from '@/lib/upload';
import { findTagByName, findPostIdsByTagId } from '@/lib/tag';
import { findMentionedUserIds, findUserByUsername } from '@/lib/user';
import { countChildCategories, findCategoryById } from '@/lib/category';
import { findFollow } from '@/lib/social';
import { ServiceError } from '@/lib/errors';
import { createNotification } from '@/lib/notification';
import {
	logActivity,
	POST_CREATE,
	POST_UPDATE,
	POST_DELETE,
	COMMENT_CREATE,
	COMMENT_DELETE
} from '@/lib/activity';
import { generateShortId } from '@/lib/shortid';
import { parseMentions, parseTags } from '@/lib/parser';
import {
	VALID_VISIBILITIES,
	type Visibility,
	checkPostVisibility,
	getVisibilityFilter
} from '@/lib/visibility';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';
import { hashPassword } from '@/lib/auth';
import { resolvePostAssets } from '@/services/post-assets.service';
import {
	cleanupWatermarkFiles,
	renderMediaWatermark,
	toWatermarkConfiguration
} from '@/services/watermark.service';

/** 评论内容最大长度 */
const COMMENT_MAX_LENGTH = 1000;

const VALID_MODES = ['weibo', 'forum', 'blog'] as const;
const CUSTOM_CATEGORY_MAX_LENGTH = 50;
const UPLOAD_RESERVATION_PREVIEW_PATH = /^\/media\/reservations\/([^/?]+)\/preview(?:\?[^#]*)?$/;

const SENSITIVE_FIELDS = ['passwordHash', 'allowedUserIds'] as const;

// ── 类型定义 ──

export interface CreateCommentInput {
	userId: string;
	postId: string;
	content: string;
	parentId?: string;
}

export interface CreateCommentResult {
	id: string;
	postId: string;
	userId: string;
	parentId: string | null;
	content: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	user: {
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
	};
	likeCount: number;
	liked: boolean;
}

export interface DeleteCommentInput {
	userId: string;
	commentId: string;
}

// ── 业务函数 ──

/**
 * 创建评论
 *
 * 校验帖子存在/未删除/未锁定，校验内容，校验 parentId，
 * 创建评论记录，异步发送通知和活动日志。
 */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
	const { userId, postId, content, parentId } = input;

	// 1. 验证帖子存在、未删除、未锁定
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}
	if (post.isDeleted) {
		throw new ServiceError('BAD_REQUEST', '帖子已删除，无法评论');
	}
	if (post.isLocked) {
		throw new ServiceError('FORBIDDEN', '帖子已锁定，无法评论');
	}

	// 2. 校验内容
	if (!content || !content.trim()) {
		throw new ServiceError('BAD_REQUEST', '评论内容不能为空');
	}
	if (content.length > COMMENT_MAX_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `评论不能超过 ${COMMENT_MAX_LENGTH} 个字符`);
	}

	// 3. 验证 parentId 属于同一帖子
	let parentCommentAuthorId: string | undefined;
	if (parentId) {
		const parentComment = await findCommentById(parentId);
		if (!parentComment) {
			throw new ServiceError('NOT_FOUND', '回复的评论不存在');
		}
		if (parentComment.postId !== postId) {
			throw new ServiceError('BAD_REQUEST', '回复的评论不属于该帖子');
		}
		// 不允许回复二级评论（只支持两级）
		if (parentComment.parentId) {
			throw new ServiceError('BAD_REQUEST', '不支持多级嵌套回复');
		}
		parentCommentAuthorId = parentComment.userId;
	}

	// 4. 创建评论
	const comment = await createCommentWithActivity(
		{
			postId,
			userId,
			parentId: parentId || null,
			content: content.trim()
		},
		{
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}
		}
	);

	// 5. 异步通知和活动日志
	createNotification('comment', userId, post.userId, postId, comment.id).catch(() => {});
	if (parentCommentAuthorId && parentCommentAuthorId !== post.userId) {
		createNotification('comment', userId, parentCommentAuthorId, postId, comment.id).catch(
			() => {}
		);
	}
	for (const mentionedUser of await findMentionedUserIds(
		parseMentions(comment.content),
		userId
	)) {
		createNotification('mention', userId, mentionedUser.id, postId, comment.id).catch(() => {});
	}
	logActivity(COMMENT_CREATE, userId, 'comment', comment.id, post.userId, postId).catch(() => {});

	return {
		id: comment.id,
		postId: comment.postId,
		userId: comment.userId,
		parentId: comment.parentId,
		content: comment.content,
		isDeleted: comment.isDeleted,
		createdAt: comment.createdAt.toISOString(),
		updatedAt: comment.updatedAt.toISOString(),
		user: comment.user,
		likeCount: 0,
		liked: false
	};
}

/**
 * 删除评论（软删除）
 *
 * 校验评论存在、是作者、未删除，标记 isDeleted = true。
 */
export async function deleteComment(input: DeleteCommentInput): Promise<{ id: string }> {
	const { userId, commentId } = input;

	// 1. 验证评论存在
	const comment = await findCommentById(commentId);
	if (!comment) {
		throw new ServiceError('NOT_FOUND', '评论不存在');
	}

	// 2. 验证是评论作者
	if (comment.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权删除此评论');
	}

	// 3. 已删除的评论
	if (comment.isDeleted) {
		throw new ServiceError('NOT_FOUND', '评论不存在');
	}

	// 4. 软删除
	await softDeleteComment(commentId);

	// 记录删除评论活动（异步，不阻塞主流程）
	logActivity(COMMENT_DELETE, userId, 'comment', commentId, comment.userId, comment.postId).catch(
		() => {}
	);

	return { id: commentId };
}

/** 创建帖子输入参数 */
export interface CreatePostInput {
	userId: string;
	content: string;
	visibility?: string;
	mediaIds?: string[];
	thumbnailFileStorageId?: string | null;
	attachmentFileStorageIds?: string[];
	/** 预约预览 URL 数组；论坛和博客正文也会自动提取同类 URL。 */
	images?: string[];
	password?: string;
	allowedUserIds?: string[];
	mode?: string;
	title?: string;
	categoryId?: string;
	customCategory?: string;
}

export interface UpdatePostInput {
	userId: string;
	postId: string;
	content: string;
	visibility?: string;
	mediaIds?: string[];
	thumbnailFileStorageId?: string | null;
	attachmentFileStorageIds?: string[];
	/** 编辑正文中新增的预约预览 URL。 */
	images?: string[];
	password?: string;
	allowedUserIds?: string[];
	mode?: string;
	title?: string;
	categoryId?: string;
	customCategory?: string;
}

/** 删除帖子输入参数 */
export interface DeletePostInput {
	userId: string;
	postId: string;
}

/** Agent 帖子列表查询参数 */
export interface GetPostsInput {
	userId: string;
	keyword?: string;
	tag?: string;
	from?: Date;
	to?: Date;
	targetUsername?: string;
	userScope: string;
	sort: string;
	skip: number;
	limit: number;
	followingIds: string[];
	followerIds: string[];
}

/** Agent 帖子详情查询参数 */
export interface GetPostDetailInput {
	userId: string;
	postId: string;
	commentsParam: number;
}

// ── 辅助函数 ──

/**
 * 从帖子对象中移除敏感字段
 *
 * @param post - 帖子对象
 * @returns 移除敏感字段后的帖子对象
 */
function sanitizePost<T extends Record<string, unknown>>(post: T): T {
	const sanitized = { ...post };
	for (const field of SENSITIVE_FIELDS) {
		delete sanitized[field];
	}
	return sanitized;
}

/** 在帖子事务提交后逐图渲染水印；任一图片失败不影响发帖或其余图片。 */
async function renderPostWatermarks(postId: string, mediaIds?: string[]): Promise<void> {
	const [config, post] = await Promise.all([
		prisma.systemConfig.findUnique({ where: { id: 'global' } }),
		prisma.post.findUnique({
			where: { id: postId },
			select: {
				createdAt: true,
				user: { select: { username: true, displayName: true } },
				media: {
					where: { fileType: 'image', ...(mediaIds ? { id: { in: mediaIds } } : {}) },
					select: { id: true, fileStorage: { select: { filePath: true } } }
				}
			}
		})
	]);
	const watermark = toWatermarkConfiguration(config);
	if (!watermark.enabled || !post) return;
	for (const media of post.media) {
		try {
			await renderMediaWatermark({
				mediaId: media.id,
				filePath: media.fileStorage.filePath,
				configuration: watermark,
				username: post.user.username,
				nickname: post.user.displayName,
				publishedAt: post.createdAt
			});
		} catch (error) {
			console.warn('media.watermark_render_failed', {
				mediaId: media.id,
				reason: error instanceof Error ? error.message : 'unknown'
			});
		}
	}
}

/** 从论坛/博客正文提取本站上传预约预览 URL，远程图片永不纳入帖子媒体。 */
function embeddedReservationPreviewUrls(content: string): string[] {
	return [
		...new Set(
			content.match(/\/media\/reservations\/[^/?\s)]+\/preview(?:\?[^\s)]*)?/g) ?? []
		)
	];
}

/**
 * 创建帖子
 *
 * 校验输入参数，委托 lib 层事务创建帖子，
 * 异步发送通知和活动日志。
 *
 * @param input - 创建帖子参数
 * @returns 创建的帖子完整数据（含关联）
 */
export async function createPost(input: CreatePostInput) {
	const {
		userId,
		content,
		visibility,
		mediaIds,
		thumbnailFileStorageId,
		attachmentFileStorageIds,
		password,
		allowedUserIds,
		mode,
		title,
		categoryId,
		customCategory
	} = input;

	const postMode = (mode || 'weibo') as (typeof VALID_MODES)[number];
	if (!VALID_MODES.includes(postMode)) {
		throw new ServiceError('BAD_REQUEST', `无效的帖子模式，仅支持: ${VALID_MODES.join(', ')}`);
	}

	if ((postMode === 'forum' || postMode === 'blog') && (!title || !title.trim())) {
		throw new ServiceError(
			'BAD_REQUEST',
			`${postMode === 'forum' ? '论坛' : '博客'}模式下标题必填`
		);
	}

	if (postMode === 'forum' && (!categoryId || !categoryId.trim())) {
		throw new ServiceError('BAD_REQUEST', '论坛模式下必须选择版块');
	}

	const normalizedCustomCategory = customCategory?.trim() || null;
	if (normalizedCustomCategory && postMode !== 'blog') {
		throw new ServiceError('BAD_REQUEST', '仅博客文章支持自定义分类');
	}
	if (normalizedCustomCategory && normalizedCustomCategory.length > CUSTOM_CATEGORY_MAX_LENGTH) {
		throw new ServiceError(
			'BAD_REQUEST',
			`自定义分类不能超过 ${CUSTOM_CATEGORY_MAX_LENGTH} 个字符`
		);
	}
	if (normalizedCustomCategory && categoryId?.trim()) {
		throw new ServiceError('BAD_REQUEST', '请选择系统分类或填写自定义分类，不能同时设置');
	}

	if (categoryId && categoryId.trim()) {
		const category = await findCategoryById(categoryId);
		if (!category) {
			throw new ServiceError('NOT_FOUND', '分类不存在');
		}
		if (category.mode !== postMode) {
			throw new ServiceError('BAD_REQUEST', '分类模式与帖子模式不匹配');
		}
		if (postMode === 'forum' && (await countChildCategories(category.id)) > 0) {
			throw new ServiceError('BAD_REQUEST', '论坛帖子只能发布到末级版块');
		}
	}

	const vis = (visibility || 'public') as Visibility;
	if (!VALID_VISIBILITIES.includes(vis)) {
		throw new ServiceError('BAD_REQUEST', '无效的可见度类型');
	}

	if (vis === 'password' && (!password || !password.trim())) {
		throw new ServiceError('BAD_REQUEST', '密码保护帖子需要设置密码');
	}

	if (vis === 'users' && (!allowedUserIds || allowedUserIds.length === 0)) {
		throw new ServiceError('BAD_REQUEST', '指定用户可见帖子需要选择至少一个用户');
	}

	if (!content || !content.trim()) {
		throw new ServiceError('BAD_REQUEST', '帖子内容不能为空');
	}

	if (content.length > POST_CONTENT_MAX_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
	}

	const id = generateShortId();

	let dedupedMediaIds = mediaIds ? [...new Set(mediaIds)] : [];
	const legacyBodyFileStorageIds = new Set<string>();
	const reservationIdByFileStorageId = new Map<string, string>();
	const embeddedPreviewUrls =
		postMode === 'forum' || postMode === 'blog' ? embeddedReservationPreviewUrls(content) : [];
	const embeddedReservationIds = new Set(
		embeddedPreviewUrls
			.map((url) => UPLOAD_RESERVATION_PREVIEW_PATH.exec(url)?.[1])
			.filter((id): id is string => Boolean(id))
	);
	const imageUrls = [...new Set([...(input.images ?? []), ...embeddedPreviewUrls])];

	// Agent API 兼容旧 /uploads 路径，也接受自身上传接口返回的预约预览 URL。
	// 论坛、博客还会从正文提取本站预约预览 URL，在同一帖子事务中消费。
	if (imageUrls.length > 0 && dedupedMediaIds.length === 0) {
		const { findFileStoragesByFilePaths, MAX_IMAGE_COUNT: IMG_MAX } =
			await import('@/lib/upload');
		const dedupedImages = imageUrls;
		if (dedupedImages.length > IMG_MAX) {
			throw new ServiceError('BAD_REQUEST', `图片最多 ${IMG_MAX} 张`);
		}
		const reservationIdByUrl = new Map<string, string>();
		const filePathByUrl = new Map<string, string>();
		for (const url of dedupedImages) {
			const previewMatch = UPLOAD_RESERVATION_PREVIEW_PATH.exec(url);
			if (previewMatch) reservationIdByUrl.set(url, previewMatch[1]);
			else filePathByUrl.set(url, url.startsWith('/uploads/') ? url.slice(9) : url);
		}

		const reservationIds = [...new Set(reservationIdByUrl.values())];
		const reservations = reservationIds.length
			? await prisma.uploadReservation.findMany({
					where: {
						id: { in: reservationIds },
						userId,
						expiresAt: { gt: new Date() },
						consumedAt: null,
						cancelledAt: null
					},
					select: {
						id: true,
						fileStorageId: true,
						fileStorage: { select: { fileType: true } }
					}
				})
			: [];
		if (reservations.length !== reservationIds.length) {
			throw new ServiceError('BAD_REQUEST', '部分图片不存在');
		}
		if (reservations.some((reservation) => reservation.fileStorage.fileType !== 'image')) {
			throw new ServiceError('BAD_REQUEST', '仅支持图片类型的文件');
		}

		const filePaths = [...new Set(filePathByUrl.values())];
		const fileStorages = await findFileStoragesByFilePaths(filePaths);
		if (fileStorages.length !== filePaths.length) {
			throw new ServiceError('BAD_REQUEST', '部分图片不存在');
		}
		const imageCount = fileStorages.filter((f) => f.fileType === 'image').length;
		if (imageCount !== fileStorages.length) {
			throw new ServiceError('BAD_REQUEST', '仅支持图片类型的文件');
		}
		const reservationById = new Map(
			reservations.map((reservation) => [reservation.id, reservation])
		);
		const fileStorageByPath = new Map(
			fileStorages.map((fileStorage) => [fileStorage.filePath, fileStorage])
		);
		dedupedMediaIds = [
			...new Set(
				dedupedImages.map((url) => {
					const reservationId = reservationIdByUrl.get(url);
					if (reservationId) {
						const fileStorageId = reservationById.get(reservationId)!.fileStorageId;
						if (!reservationIdByFileStorageId.has(fileStorageId)) {
							reservationIdByFileStorageId.set(fileStorageId, reservationId);
						}
						return fileStorageId;
					}
					const fileStorage = fileStorageByPath.get(filePathByUrl.get(url)!);
					legacyBodyFileStorageIds.add(fileStorage!.id);
					return fileStorage!.id;
				})
			)
		];
	}

	const requestedFiles = await findFileStoragesByIds(dedupedMediaIds);
	if (requestedFiles.length !== dedupedMediaIds.length) {
		throw new ServiceError('BAD_REQUEST', '部分文件不存在');
	}
	const requestedById = new Map(requestedFiles.map((file) => [file.id, file]));
	const bodyFileStorageIds = dedupedMediaIds.filter((id) => {
		const type = requestedById.get(id)?.fileType;
		return type === 'image' || type === 'video';
	});
	if (
		bodyFileStorageIds.filter((id) => requestedById.get(id)?.fileType === 'image').length >
		MAX_IMAGE_COUNT
	) {
		throw new ServiceError('BAD_REQUEST', `图片最多 ${MAX_IMAGE_COUNT} 张`);
	}
	const legacyAttachmentIds = dedupedMediaIds.filter(
		(id) => requestedById.get(id)?.fileType === 'attachment'
	);

	const mediaItems = (await resolvePostAssets({
		userId,
		mode: postMode,
		bodyFileStorageIds,
		thumbnailFileStorageId,
		attachmentFileStorageIds: attachmentFileStorageIds ?? legacyAttachmentIds,
		legacyBodyFileStorageIds,
		reservationIdByFileStorageId
	})).map((item) => {
		const isEmbeddedReservation =
			item.fileType === 'image' &&
			Boolean(item.reservationId && embeddedReservationIds.has(item.reservationId));
		return isEmbeddedReservation ? { ...item, mediaId: generateShortId() } : item;
	});
	let persistedContent = content.trim();
	for (const previewUrl of embeddedPreviewUrls) {
		const reservationId = UPLOAD_RESERVATION_PREVIEW_PATH.exec(previewUrl)?.[1];
		const fileStorageId = reservationId
			? [...reservationIdByFileStorageId].find(([, id]) => id === reservationId)?.[0]
			: undefined;
		const mediaId = mediaItems.find((item) => item.fileStorageId === fileStorageId)?.mediaId;
		if (mediaId) persistedContent = persistedContent.split(previewUrl).join(`/media/${mediaId}/display`);
	}

	const mentionUsernames = parseMentions(content.trim());
	const tagNames = parseTags(content.trim());

	await createPostTransaction({
		postData: {
			id,
			userId,
			content: persistedContent,
			visibility: vis,
			mode: postMode,
			title: title?.trim() || null,
			categoryId: categoryId?.trim() || null,
			customCategory: normalizedCustomCategory
		},
		mediaItems,
		mentionUsernames,
		tagNames,
		currentUserId: userId,
		password,
		allowedUserIds
	});
	await cleanupExpiredUploadReservations().catch((error) =>
		console.error('清理过期上传凭证失败:', error)
	);

	const fullPost = await findPostWithRelations(id);
	await renderPostWatermarks(id);

	if (mentionUsernames.length > 0) {
		const mentionedUsers = await findMentionedUserIds(mentionUsernames, userId);
		for (const u of mentionedUsers) {
			createNotification('mention', userId, u.id, id).catch(() => {});
		}
	}

	logActivity(POST_CREATE, userId, 'post', id, userId, id).catch(() => {});

	return sanitizePost(fullPost!);
}

/**
 * 更新帖子并消费编辑正文中新加入的图片预约。
 *
 * @param input - 作者、帖子和完整编辑内容
 * @returns 更新后的帖子关联数据
 */
export async function updatePost(input: UpdatePostInput) {
	const {
		userId,
		postId,
		content,
		visibility,
		mediaIds,
		thumbnailFileStorageId,
		attachmentFileStorageIds,
		password,
		allowedUserIds,
		mode,
		title,
		categoryId,
		customCategory
	} = input;
	const post = await findPostById(postId);
	if (!post) throw new ServiceError('NOT_FOUND', '帖子不存在');
	if (post.userId !== userId) throw new ServiceError('FORBIDDEN', '无权编辑此帖子');
	if (post.isLocked) throw new ServiceError('FORBIDDEN', '帖子已被锁定，无法编辑');
	if (post.isDeleted) throw new ServiceError('BAD_REQUEST', '帖子已删除，无法编辑');
	if (!content || !content.trim()) throw new ServiceError('BAD_REQUEST', '帖子内容不能为空');
	if (content.length > POST_CONTENT_MAX_LENGTH)
		throw new ServiceError('BAD_REQUEST', `内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
	if (visibility !== undefined) {
		const vis = visibility as Visibility;
		if (!VALID_VISIBILITIES.includes(vis)) throw new ServiceError('BAD_REQUEST', '无效的可见度类型');
		if (vis === 'password' && (!password || !password.trim()))
			throw new ServiceError('BAD_REQUEST', '密码保护帖子需要设置密码');
		if (vis === 'users' && (!allowedUserIds || allowedUserIds.length === 0))
			throw new ServiceError('BAD_REQUEST', '指定用户可见帖子需要选择至少一个用户');
	}
	const postMode = (mode || post.mode) as (typeof VALID_MODES)[number];
	if (!VALID_MODES.includes(postMode))
		throw new ServiceError('BAD_REQUEST', `无效的帖子模式，仅支持: ${VALID_MODES.join(', ')}`);
	const effectiveTitle = title ?? post.title;
	if ((postMode === 'forum' || postMode === 'blog') && !effectiveTitle?.trim())
		throw new ServiceError('BAD_REQUEST', `${postMode === 'forum' ? '论坛' : '博客'}模式下标题必填`);
	const effectiveCategoryId = categoryId ?? post.categoryId;
	if (postMode === 'forum' && !effectiveCategoryId?.trim())
		throw new ServiceError('BAD_REQUEST', '论坛模式下必须选择版块');
	const normalizedCustomCategory = customCategory?.trim() || null;
	if (normalizedCustomCategory && postMode !== 'blog')
		throw new ServiceError('BAD_REQUEST', '仅博客文章支持自定义分类');
	if (normalizedCustomCategory && normalizedCustomCategory.length > CUSTOM_CATEGORY_MAX_LENGTH)
		throw new ServiceError('BAD_REQUEST', `自定义分类不能超过 ${CUSTOM_CATEGORY_MAX_LENGTH} 个字符`);
	if (normalizedCustomCategory && categoryId?.trim())
		throw new ServiceError('BAD_REQUEST', '请选择系统分类或填写自定义分类，不能同时设置');
	if (categoryId?.trim()) {
		const category = await findCategoryById(categoryId);
		if (!category) throw new ServiceError('NOT_FOUND', '分类不存在');
		if (category.mode !== postMode) throw new ServiceError('BAD_REQUEST', '分类模式与帖子模式不匹配');
		if (postMode === 'forum' && (await countChildCategories(category.id)) > 0)
			throw new ServiceError('BAD_REQUEST', '论坛帖子只能发布到末级版块');
	}

	const currentMedia = await findMediaByPostId(post.id);
	const dedupedMediaIds = mediaIds ? [...new Set(mediaIds)] : [];
	const requestedFiles = await findFileStoragesByIds(dedupedMediaIds);
	if (requestedFiles.length !== dedupedMediaIds.length)
		throw new ServiceError('BAD_REQUEST', '部分文件不存在');
	const requestedById = new Map(requestedFiles.map((file) => [file.id, file]));
	const bodyFileStorageIds = dedupedMediaIds.filter((fileStorageId) => {
		const fileType = requestedById.get(fileStorageId)?.fileType;
		return fileType === 'image' || fileType === 'video';
	});
	if (bodyFileStorageIds.filter((id) => requestedById.get(id)?.fileType === 'image').length > MAX_IMAGE_COUNT)
		throw new ServiceError('BAD_REQUEST', `图片最多 ${MAX_IMAGE_COUNT} 张`);
	const legacyAttachmentIds = dedupedMediaIds.filter(
		(id) => requestedById.get(id)?.fileType === 'attachment'
	);
	const mediaItems = await resolvePostAssets({
		userId,
		mode: postMode,
		bodyFileStorageIds,
		thumbnailFileStorageId,
		attachmentFileStorageIds:
			attachmentFileStorageIds ?? (mediaIds === undefined ? undefined : legacyAttachmentIds),
		currentMedia,
		preserveBody: mediaIds === undefined,
		preserveThumbnail: thumbnailFileStorageId === undefined,
		preserveAttachments:
			attachmentFileStorageIds === undefined && legacyAttachmentIds.length === 0
	});

	const embeddedPreviewUrls =
		postMode === 'forum' || postMode === 'blog' ? embeddedReservationPreviewUrls(content) : [];
	const reservationIds = embeddedPreviewUrls
		.map((url) => UPLOAD_RESERVATION_PREVIEW_PATH.exec(url)?.[1])
		.filter((id): id is string => Boolean(id));
	const reservations = reservationIds.length
		? await prisma.uploadReservation.findMany({
				where: {
					id: { in: reservationIds },
					userId,
					expiresAt: { gt: new Date() },
					consumedAt: null,
					cancelledAt: null,
					fileStorage: { fileType: 'image' }
				},
				select: { id: true, fileStorageId: true }
			})
		: [];
	if (reservations.length !== reservationIds.length)
		throw new ServiceError('BAD_REQUEST', '部分正文图片上传凭证无效、已过期或不属于当前用户');
	const existingFileIds = new Set(currentMedia.map((media) => media.fileStorageId));
	const mediaIdByReservation: Record<string, string> = {};
	const embeddedMediaItems = reservations
		.filter((reservation) => !existingFileIds.has(reservation.fileStorageId))
		.map((reservation, index) => {
			const mediaId = generateShortId();
			mediaIdByReservation[reservation.id] = mediaId;
			return {
				mediaId,
				fileStorageId: reservation.fileStorageId,
				fileType: 'image',
				sortOrder: currentMedia.length + index,
				slot: null,
				reservationId: reservation.id
			};
		});
	let persistedContent = content.trim();
	for (const previewUrl of embeddedPreviewUrls) {
		const reservationId = UPLOAD_RESERVATION_PREVIEW_PATH.exec(previewUrl)?.[1];
		const mediaId = reservationId ? mediaIdByReservation[reservationId] : undefined;
		if (mediaId) persistedContent = persistedContent.split(previewUrl).join(`/media/${mediaId}/display`);
	}
	const updateData: Record<string, unknown> = { content: persistedContent, isEdited: true };
	if (visibility !== undefined) {
		updateData.visibility = visibility;
		updateData.passwordHash = visibility === 'password' && password ? await hashPassword(password.trim()) : null;
		updateData.allowedUserIds = visibility === 'users' && allowedUserIds ? JSON.stringify(allowedUserIds) : null;
	}
	if (mode !== undefined) updateData.mode = postMode;
	if (title !== undefined) updateData.title = title.trim() || null;
	if (categoryId !== undefined) updateData.categoryId = categoryId.trim() || null;
	if (customCategory !== undefined) updateData.customCategory = normalizedCustomCategory;
	if (normalizedCustomCategory) updateData.categoryId = null;
	else if (categoryId?.trim()) updateData.customCategory = null;
	const mentionUsernames = parseMentions(persistedContent);
	const tagNames = parseTags(persistedContent);
	const { post: updated, releasedFileStorageIds, releasedWatermarkFilePaths, addedMediaIds } =
		await updatePostTransaction({
			postId,
			previousContent: post.content,
			updateData,
			currentMedia,
			mediaItems: [...mediaItems, ...embeddedMediaItems],
			mentionUsernames,
			tagNames,
			currentUserId: userId
		});
	await cleanupUnreferencedFiles(releasedFileStorageIds);
	await cleanupWatermarkFiles(releasedWatermarkFilePaths);
	const addedMedia = updated.media.filter((media) =>
		addedMediaIds.includes(`${media.slot || ''}:${media.fileStorageId}`)
	);
	await renderPostWatermarks(postId, addedMedia.map((media) => media.id));
	await cleanupExpiredUploadReservations().catch((error) =>
		console.error('清理过期上传凭证失败:', error)
	);
	logActivity(POST_UPDATE, userId, 'post', postId, post.userId, postId).catch(() => {});
	return sanitizePost(updated);
}

/**
 * 删除帖子（软删除）
 *
 * 校验帖子存在/作者/锁定/删除状态，标记 isDeleted = true，
 * 异步记录活动日志。
 *
 * @param input - 删除帖子参数
 * @returns 被删除的帖子 ID
 */
export async function deletePost(input: DeletePostInput) {
	const { userId, postId } = input;

	// 1. 查询帖子
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}

	// 2. 验证是帖子作者
	if (post.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权删除此帖子');
	}

	// 3. 验证帖子未被锁定
	if (post.isLocked) {
		throw new ServiceError('FORBIDDEN', '帖子已被锁定，无法删除');
	}

	// 已经删除的帖子
	if (post.isDeleted) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}

	// 4. 软删除
	await softDeletePost(postId);

	// 5. 记录删除帖子活动（异步，不阻塞主流程）
	logActivity(POST_DELETE, userId, 'post', postId, post.userId, postId).catch(() => {});

	return { id: postId };
}

/**
 * 获取 Agent 帖子列表
 *
 * 支持多维度过滤（keyword/tag/time/user/userScope）、可见度过滤、hot 排序。
 * 返回格式化后的帖子列表文本。
 *
 * @param input - 查询参数
 * @returns 格式化后的帖子列表文本
 */
export async function getPosts(input: GetPostsInput) {
	const {
		userId,
		keyword,
		tag,
		from,
		to,
		targetUsername,
		userScope,
		sort,
		skip,
		limit,
		followingIds,
		followerIds
	} = input;

	// 可见度过滤基础条件
	const visibilityFilter = getVisibilityFilter({ userId }, { followingIds, followerIds });

	// 构建 where 条件
	const where: Prisma.PostWhereInput = {
		isDeleted: false,
		user: { deletedAt: null, isDisabled: false },
		...visibilityFilter
	};
	let tagPostIds: string[] | undefined;
	let scopedUserIds: string[] | undefined;

	// keyword 过滤
	if (keyword) {
		where.content = { contains: keyword };
	}

	// 时间范围过滤
	if (from || to) {
		const createdAtFilter: Record<string, Date> = {};
		if (from) createdAtFilter.gte = from;
		if (to) createdAtFilter.lte = to;
		where.createdAt = createdAtFilter;
	}

	// tag 过滤
	if (tag) {
		const tagRecord = await findTagByName(tag);
		if (!tagRecord) {
			// 标签不存在，返回空列表
			return [];
		}
		const postIdsByTag = await findPostIdsByTagId(tagRecord.id);
		if (postIdsByTag.length === 0) {
			return [];
		}
		tagPostIds = postIdsByTag;
		where.id = { in: postIdsByTag };
	}

	// user 过滤
	if (targetUsername) {
		const targetUser = await findUserByUsername(targetUsername);
		if (!targetUser) {
			return [];
		}
		where.userId = targetUser.id;
		scopedUserIds = [targetUser.id];
	} else if (userScope === 'following') {
		where.userId = { in: [...followingIds, userId] };
		scopedUserIds = [...followingIds, userId];
	} else if (userScope === 'followers') {
		where.userId = { in: [...followerIds, userId] };
		scopedUserIds = [...followerIds, userId];
	}

	// 查询帖子
	let posts: Array<{
		id: string;
		content: string;
		createdAt: Date;
		_count?: { likes: number; comments: number };
	}>;

	if (sort === 'hot') {
		const { getTrendingFeed } = await import('@/services/recommend.service');
		const hot = await getTrendingFeed({
			viewerId: userId,
			page: Math.floor(skip / limit) + 1,
			pageSize: limit,
			postIds: tagPostIds,
			userIds: scopedUserIds,
			keyword,
			from,
			to
		});
		posts = hot.items;
	} else {
		// latest/earliest 排序
		const orderBy =
			sort === 'earliest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

		posts = await findAgentPosts(where, { orderBy, skip, take: limit });
	}

	return posts;
}

/**
 * 获取 Agent 帖子详情
 *
 * 查询帖子详情，含可见度检查和评论。
 * password 帖子返回提示，users 帖子无权返回提示。
 *
 * @param input - 查询参数
 * @returns 格式化后的帖子详情文本，或错误信息对象
 */
export async function getPostDetail(input: GetPostDetailInput) {
	const { userId, postId, commentsParam } = input;

	// 1. 查询帖子
	const post = await findAgentPostDetail(postId);

	if (!post) {
		return { error: '帖子不存在', status: 404 };
	}

	if (post.isDeleted) {
		return { error: '该内容已删除', status: 400 };
	}

	// 2. 可见度检查：查询 isFollower/isFollowing
	let isFollower = false;
	let isFollowing = false;
	if (userId !== post.userId) {
		const followRecord = await findFollow({
			followerId_followingId: { followerId: userId, followingId: post.userId }
		});
		isFollower = !!followRecord;

		const reverseFollowRecord = await findFollow({
			followerId_followingId: { followerId: post.userId, followingId: userId }
		});
		isFollowing = !!reverseFollowRecord;
	}

	const visible = await checkPostVisibility(
		{
			visibility: post.visibility,
			userId: post.userId,
			passwordHash: post.passwordHash,
			allowedUserIds: post.allowedUserIds
		},
		{ userId },
		{ isFollower, isFollowing }
	);

	if (!visible) {
		if (post.visibility === 'password') {
			return { error: '该帖子需要密码访问', status: 403 };
		}
		if (post.visibility === 'users') {
			return { error: '无权查看该帖子', status: 403 };
		}
		return { error: '帖子不存在', status: 404 };
	}

	// 3. 查询评论
	let comments: Array<{
		id: string;
		content: string;
		createdAt: Date;
		isDeleted: boolean;
		user: { username: string; displayName: string };
		replies: Array<{
			id: string;
			content: string;
			parentId: string;
			createdAt: Date;
			isDeleted: boolean;
			user: { username: string; displayName: string };
		}>;
	}> = [];

	if (commentsParam !== -1) {
		const takeCount = commentsParam > 0 ? commentsParam : undefined;

		const rawComments = await findAgentPostComments(postId, takeCount);

		comments = rawComments.map((c) => ({
			id: c.id,
			content: c.content,
			createdAt: c.createdAt,
			isDeleted: c.isDeleted,
			user: c.user,
			replies: c.replies.map((r) => ({
				id: r.id,
				content: r.content,
				parentId: r.parentId ?? '',
				createdAt: r.createdAt,
				isDeleted: r.isDeleted,
				user: r.user
			}))
		}));
	}

	return { data: { post, comments } };
}
