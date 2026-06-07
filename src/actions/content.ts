/**
 * 内容管理 Actions
 *
 * 提供帖子、评论的创建、更新、删除功能。
 * 业务逻辑委托 content.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest, hashPassword } from '@/lib/auth';
import { createNotification } from '@/lib/notification';
import { logActivity, POST_CREATE, POST_UPDATE, POST_DELETE } from '@/lib/activity';
import { generateShortId } from '@/lib/shortid';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { deleteFileRef, MAX_IMAGE_COUNT } from '@/lib/upload';
import { parseMentions, parseTags } from '@/lib/parser';
import { VALID_VISIBILITIES, type Visibility } from '@/lib/visibility';
import { insertFeedback, upsertItem, hideItem, FEEDBACK_TYPE_COMMENT } from '@/lib/gorse';
import { ServiceError } from '@/lib/errors';
import {
	createComment as createCommentService,
	deleteComment as deleteCommentService
} from '@/services/content.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/** 需要从帖子响应中排除的敏感字段 */
const SENSITIVE_FIELDS = ['passwordHash', 'allowedUserIds'] as const;

/** 合法的帖子模式列表 */
const VALID_MODES = ['weibo', 'forum', 'blog'] as const;

/**
 * 从帖子对象中移除敏感字段
 */
function sanitizePost<T extends Record<string, unknown>>(post: T): T {
	const sanitized = { ...post };
	for (const field of SENSITIVE_FIELDS) {
		delete sanitized[field];
	}
	return sanitized;
}

/**
 * 创建帖子 Action
 */
export const createPost = defineAction({
	input: z.object({
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional(),
		mode: z.string().optional(),
		title: z.string().optional(),
		categoryId: z.string().optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		let { content, visibility, mediaIds, password, allowedUserIds, mode, title, categoryId } =
			input;

		// 校验 mode 合法性：默认 weibo，必须是 weibo/forum/blog 之一
		const postMode = (mode || 'weibo') as (typeof VALID_MODES)[number];
		if (!VALID_MODES.includes(postMode)) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `无效的帖子模式，仅支持: ${VALID_MODES.join(', ')}`
			});
		}

		// forum 和 blog 模式下 title 必填
		if ((postMode === 'forum' || postMode === 'blog') && (!title || !title.trim())) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `${postMode === 'forum' ? '论坛' : '博客'}模式下标题必填`
			});
		}

		// forum 模式下 categoryId 必填
		if (postMode === 'forum' && (!categoryId || !categoryId.trim())) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: '论坛模式下必须选择版块'
			});
		}

		// 如果指定了 categoryId，验证分类存在且 mode 匹配
		if (categoryId && categoryId.trim()) {
			const category = await prisma.category.findUnique({ where: { id: categoryId } });
			if (!category) {
				throw new ActionError({ code: 'NOT_FOUND', message: '分类不存在' });
			}
			if (category.mode !== postMode) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: '分类模式与帖子模式不匹配'
				});
			}
		}

		// mediaIds 去重，防止重复关联
		if (mediaIds && mediaIds.length > 0) {
			mediaIds = [...new Set(mediaIds)];
		}

		// 校验可见度值合法性
		const vis = (visibility || 'public') as Visibility;
		if (!VALID_VISIBILITIES.includes(vis)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的可见度类型' });
		}

		// visibility=password 时，密码必填
		if (vis === 'password' && (!password || !password.trim())) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '密码保护帖子需要设置密码' });
		}

		// visibility=users 时，allowedUserIds 必填且非空
		if (vis === 'users' && (!allowedUserIds || allowedUserIds.length === 0)) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: '指定用户可见帖子需要选择至少一个用户'
			});
		}

		// 校验内容非空
		if (!content || !content.trim()) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子内容不能为空' });
		}

		// 校验内容长度
		if (content.length > POST_CONTENT_MAX_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`
			});
		}

		// 校验图片数量限制（按 mediaIds 数组中图片类型计数，而非去重后的 FileStorage 数量）
		if (mediaIds && mediaIds.length > 0) {
			const fileStorages = await prisma.fileStorage.findMany({
				where: { id: { in: mediaIds } }
			});
			const fileTypeMap = new Map(fileStorages.map((f) => [f.id, f.fileType]));
			const imageCount = mediaIds.filter((id) => fileTypeMap.get(id) === 'image').length;
			if (imageCount > MAX_IMAGE_COUNT) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `图片最多 ${MAX_IMAGE_COUNT} 张`
				});
			}
		}

		// 生成 8 位短链 ID
		const id = generateShortId();

		// 处理可见度相关字段
		let passwordHash: string | undefined;
		let allowedUserIdsJson: string | undefined;

		// visibility=password 时，哈希密码
		if (vis === 'password' && password) {
			passwordHash = await hashPassword(password.trim());
		}

		// visibility=users 时，序列化用户 ID 列表
		if (vis === 'users' && allowedUserIds) {
			allowedUserIdsJson = JSON.stringify(allowedUserIds);
		}

		// 使用事务包裹创建帖子涉及的多个写操作，保证数据一致性
		const post = await prisma.$transaction(async (tx) => {
			// 创建帖子，存储原始 Markdown
			const createdPost = await tx.post.create({
				data: {
					id,
					userId: currentUser.userId,
					content: content.trim(),
					visibility: vis,
					passwordHash,
					allowedUserIds: allowedUserIdsJson,
					mode: postMode,
					title: title?.trim() || null,
					categoryId: categoryId?.trim() || null
				}
			});

			// 创建 Media 关联记录
			if (mediaIds && mediaIds.length > 0) {
				// 查询所有 FileStorage 记录以获取 fileType 和 originalName
				const fileStorages = await tx.fileStorage.findMany({
					where: { id: { in: mediaIds } }
				});

				// 按 mediaIds 的顺序创建 Media 记录
				await tx.media.createMany({
					data: fileStorages.map((fs, index) => ({
						postId: createdPost.id,
						fileStorageId: fs.id,
						fileType: fs.fileType,
						originalName: '',
						sortOrder: index
					}))
				});
			}

			// 解析 @提及，验证用户存在并创建 Mention 记录
			const mentionUsernames = parseMentions(content.trim());
			if (mentionUsernames.length > 0) {
				// 查询被提及的用户（排除自己 @自己）
				const mentionedUsers = await tx.user.findMany({
					where: {
						username: { in: mentionUsernames },
						id: { not: currentUser.userId }
					},
					select: { id: true }
				});
				if (mentionedUsers.length > 0) {
					await tx.mention.createMany({
						data: mentionedUsers.map((u) => ({
							postId: createdPost.id,
							userId: u.id
						}))
					});
				}
			}

			// 解析 #标签，创建或复用 Tag 记录，创建 PostTag 关联
			const tagNames = parseTags(content.trim());
			if (tagNames.length > 0) {
				for (const name of tagNames) {
					// upsert：标签不存在则创建，已存在则复用
					const tag = await tx.tag.upsert({
						where: { name },
						update: {},
						create: { name }
					});
					// 创建帖子-标签关联
					await tx.postTag.create({
						data: {
							postId: createdPost.id,
							tagId: tag.id
						}
					});
				}
			}

			return createdPost;
		});

		// 事务完成后，异步发送 @提及通知（不阻塞主流程）
		const mentionUsernames = parseMentions(content.trim());
		if (mentionUsernames.length > 0) {
			const mentionedUsers = await prisma.user.findMany({
				where: {
					username: { in: mentionUsernames },
					id: { not: currentUser.userId }
				},
				select: { id: true }
			});
			for (const u of mentionedUsers) {
				createNotification('mention', currentUser.userId, u.id, post.id).catch(() => {});
			}
		}

		// 重新查询帖子以获取完整的关联数据（tags、mentions、category）
		const fullPost = await prisma.post.findUnique({
			where: { id: post.id },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
					}
				},
				media: {
					orderBy: { sortOrder: 'asc' },
					include: {
						fileStorage: {
							select: {
								id: true,
								filePath: true,
								fileSize: true,
								mimeType: true,
								fileType: true
							}
						}
					}
				},
				tags: {
					include: {
						tag: {
							select: {
								id: true,
								name: true
							}
						}
					}
				},
				mentions: {
					include: {
						user: {
							select: {
								id: true,
								username: true,
								displayName: true
							}
						}
					}
				},
				category: {
					select: {
						id: true,
						name: true,
						slug: true,
						mode: true
					}
				}
			}
		});

		// 记录创建帖子活动（异步，不阻塞主流程）
		logActivity(
			POST_CREATE,
			currentUser.userId,
			'post',
			post.id,
			currentUser.userId,
			post.id
		).catch(() => {});

		// 同步帖子到 Gorse 推荐引擎（异步，不阻塞）
		const gorseCategories: string[] = [];
		if (fullPost?.category?.slug) gorseCategories.push(fullPost.category.slug);
		if (fullPost?.tags) fullPost.tags.forEach((pt: any) => gorseCategories.push(pt.tag.name));
		upsertItem(post.id, {
			isDeleted: false,
			categories: gorseCategories,
			labels: {
				mode: postMode,
				tags: fullPost?.tags?.map((pt: any) => pt.tag.name) ?? []
			},
			timestamp: post.createdAt.toISOString(),
			comment: title?.trim() || content.trim().slice(0, 100)
		}).catch(() => {});

		return sanitizePost(fullPost || post);
	}
});

/**
 * 编辑帖子 Action
 */
export const updatePost = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional(),
		mode: z.string().optional(),
		title: z.string().optional(),
		categoryId: z.string().optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId, content, visibility, password, allowedUserIds, mode, title, categoryId } =
			input;
		let { mediaIds } = input;

		// 查询帖子
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}

		// 2. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权编辑此帖子' });
		}

		// 3. 验证帖子未被锁定
		if (post.isLocked) {
			throw new ActionError({ code: 'FORBIDDEN', message: '帖子已被锁定，无法编辑' });
		}

		// 已删除的帖子不可编辑
		if (post.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除，无法编辑' });
		}

		// mediaIds 去重，防止重复关联
		if (mediaIds && mediaIds.length > 0) {
			mediaIds = [...new Set(mediaIds)];
		}

		// 校验可见度值合法性（如果传了 visibility）
		if (visibility !== undefined) {
			const vis = visibility as Visibility;
			if (!VALID_VISIBILITIES.includes(vis)) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '无效的可见度类型' });
			}

			// visibility=password 时，密码必填
			if (vis === 'password' && (!password || !password.trim())) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '密码保护帖子需要设置密码' });
			}

			// visibility=users 时，allowedUserIds 必填且非空
			if (vis === 'users' && (!allowedUserIds || allowedUserIds.length === 0)) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: '指定用户可见帖子需要选择至少一个用户'
				});
			}
		}

		// 校验 mode/title/categoryId（如果传了 mode）
		const postMode = (mode || post.mode) as (typeof VALID_MODES)[number];
		if (mode !== undefined) {
			if (!VALID_MODES.includes(postMode)) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `无效的帖子模式，仅支持: ${VALID_MODES.join(', ')}`
				});
			}
		}

		// forum 和 blog 模式下 title 必填
		if ((postMode === 'forum' || postMode === 'blog') && (!title || !title.trim())) {
			// 编辑时如果没传 title，检查原帖子是否有 title
			const effectiveTitle = title ?? post.title;
			if (!effectiveTitle || !effectiveTitle.trim()) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `${postMode === 'forum' ? '论坛' : '博客'}模式下标题必填`
				});
			}
		}

		// forum 模式下 categoryId 必填
		if (postMode === 'forum' && (!categoryId || !categoryId.trim())) {
			// 编辑时如果没传 categoryId，检查原帖子是否有 categoryId
			const effectiveCategoryId = categoryId ?? post.categoryId;
			if (!effectiveCategoryId || !effectiveCategoryId.trim()) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: '论坛模式下必须选择版块'
				});
			}
		}

		// 如果指定了 categoryId，验证分类存在且 mode 匹配
		if (categoryId && categoryId.trim()) {
			const category = await prisma.category.findUnique({ where: { id: categoryId } });
			if (!category) {
				throw new ActionError({ code: 'NOT_FOUND', message: '分类不存在' });
			}
			if (category.mode !== postMode) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: '分类模式与帖子模式不匹配'
				});
			}
		}

		// 4. 校验内容非空
		if (!content || !content.trim()) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子内容不能为空' });
		}

		// 校验内容长度
		if (content.length > POST_CONTENT_MAX_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`
			});
		}

		// 5. 校验图片数量限制
		if (mediaIds && mediaIds.length > 0) {
			const fileStorages = await prisma.fileStorage.findMany({
				where: { id: { in: mediaIds } }
			});
			const imageCount = fileStorages.filter((f) => f.fileType === 'image').length;
			if (imageCount > MAX_IMAGE_COUNT) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `图片最多 ${MAX_IMAGE_COUNT} 张`
				});
			}
		}

		// 查询当前帖子的 Media 关联
		const currentMedia = await prisma.media.findMany({
			where: { postId: post.id },
			orderBy: { sortOrder: 'asc' }
		});

		// 使用事务包裹编辑帖子涉及的多个写操作，保证数据一致性
		const updated = await prisma.$transaction(async (tx) => {
			// 6. 保存旧版本到 PostRevision（含 mediaSnapshot）
			await tx.postRevision.create({
				data: {
					postId: post.id,
					content: post.content,
					mediaSnapshot: JSON.stringify(currentMedia.map((m) => m.fileStorageId))
				}
			});

			// 8. 更新 Media 关联
			// 获取旧的 fileStorageId 列表
			const oldFileStorageIds = new Set(currentMedia.map((m) => m.fileStorageId));
			// 新的 fileStorageId 列表
			const newFileStorageIds = new Set(mediaIds || []);

			// 需要删除的 Media（旧有新无）
			const toDelete = currentMedia.filter((m) => !newFileStorageIds.has(m.fileStorageId));
			// 需要新增的 fileStorageId（新有旧无）
			const toAdd = (mediaIds || []).filter((id) => !oldFileStorageIds.has(id));

			// 删除旧的 Media 关联
			if (toDelete.length > 0) {
				await tx.media.deleteMany({
					where: { id: { in: toDelete.map((m) => m.id) } }
				});
			}

			// 创建新的 Media 关联
			if (toAdd.length > 0) {
				const addFileStorages = await tx.fileStorage.findMany({
					where: { id: { in: toAdd } }
				});
				// 计算排序起始值
				const maxSortOrder =
					currentMedia.length > 0
						? Math.max(...currentMedia.map((m) => m.sortOrder))
						: -1;
				await tx.media.createMany({
					data: addFileStorages.map((fs, index) => ({
						postId: post.id,
						fileStorageId: fs.id,
						fileType: fs.fileType,
						originalName: '',
						sortOrder: maxSortOrder + 1 + index
					}))
				});
			}

			// 7. 更新内容，标记 isEdited = true
			// 构建更新数据
			const updateData: Record<string, unknown> = {
				content: content.trim(),
				isEdited: true
			};

			// 如果传了 visibility，更新可见度相关字段
			if (visibility !== undefined) {
				updateData.visibility = visibility;
				// visibility=password 时，哈希密码
				if (visibility === 'password' && password) {
					updateData.passwordHash = await hashPassword(password.trim());
				} else if (visibility !== 'password') {
					// 切换到其他可见度时，清除密码哈希
					updateData.passwordHash = null;
				}
				// visibility=users 时，序列化用户 ID 列表
				if (visibility === 'users' && allowedUserIds) {
					updateData.allowedUserIds = JSON.stringify(allowedUserIds);
				} else if (visibility !== 'users') {
					// 切换到其他可见度时，清除用户列表
					updateData.allowedUserIds = null;
				}
			}

			// 如果传了 mode，更新模式相关字段
			if (mode !== undefined) {
				updateData.mode = postMode;
			}
			// 如果传了 title，更新标题
			if (title !== undefined) {
				updateData.title = title.trim() || null;
			}
			// 如果传了 categoryId，更新分类
			if (categoryId !== undefined) {
				updateData.categoryId = categoryId.trim() || null;
			}

			const updatedPost = await tx.post.update({
				where: { id: postId },
				data: updateData,
				include: {
					user: {
						select: {
							id: true,
							username: true,
							displayName: true,
							avatarUrl: true
						}
					},
					media: {
						orderBy: { sortOrder: 'asc' },
						include: {
							fileStorage: {
								select: {
									id: true,
									filePath: true,
									fileSize: true,
									mimeType: true,
									fileType: true
								}
							}
						}
					},
					tags: {
						include: {
							tag: {
								select: {
									id: true,
									name: true
								}
							}
						}
					},
					mentions: {
						include: {
							user: {
								select: {
									id: true,
									username: true,
									displayName: true
								}
							}
						}
					},
					category: {
						select: {
							id: true,
							name: true,
							slug: true,
							mode: true
						}
					}
				}
			});

			// 9. 重建 @提及和 #标签关联
			// 删除旧的 PostTag 和 Mention 记录
			await tx.postTag.deleteMany({ where: { postId: post.id } });
			await tx.mention.deleteMany({ where: { postId: post.id } });

			// 重新解析 @提及，验证用户存在并创建 Mention 记录
			const mentionUsernames = parseMentions(content.trim());
			if (mentionUsernames.length > 0) {
				const mentionedUsers = await tx.user.findMany({
					where: {
						username: { in: mentionUsernames },
						id: { not: currentUser.userId }
					},
					select: { id: true }
				});
				if (mentionedUsers.length > 0) {
					await tx.mention.createMany({
						data: mentionedUsers.map((u) => ({
							postId: post.id,
							userId: u.id
						}))
					});
				}
			}

			// 重新解析 #标签，创建或复用 Tag 记录，创建 PostTag 关联
			const tagNames = parseTags(content.trim());
			if (tagNames.length > 0) {
				for (const name of tagNames) {
					const tag = await tx.tag.upsert({
						where: { name },
						update: {},
						create: { name }
					});
					await tx.postTag.create({
						data: {
							postId: post.id,
							tagId: tag.id
						}
					});
				}
			}

			return updatedPost;
		});

		// 事务完成后，处理删除的 Media 对应的 FileStorage refCount - 1
		const deletedFileStorageIds = new Set(
			currentMedia
				.filter((m) => !new Set(mediaIds || []).has(m.fileStorageId))
				.map((m) => m.fileStorageId)
		);
		for (const fileStorageId of deletedFileStorageIds) {
			await deleteFileRef(fileStorageId);
		}

		// 记录编辑帖子活动（异步，不阻塞主流程）
		logActivity(POST_UPDATE, currentUser.userId, 'post', postId, post.userId, postId).catch(
			() => {}
		);

		// 同步更新帖子到 Gorse 推荐引擎（异步，不阻塞）
		const gorseCategories: string[] = [];
		if (updated.category?.slug) gorseCategories.push(updated.category.slug);
		if (updated.tags) updated.tags.forEach((pt: any) => gorseCategories.push(pt.tag.name));
		upsertItem(postId, {
			isDeleted: false,
			categories: gorseCategories,
			labels: {
				mode: postMode,
				tags: updated.tags?.map((pt: any) => pt.tag.name) ?? []
			},
			timestamp: updated.updatedAt.toISOString(),
			comment: updated.title || updated.content.slice(0, 100)
		}).catch(() => {});

		return sanitizePost(updated);
	}
});

/**
 * 删除帖子 Action（软删除）
 */
export const deletePost = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId } = input;

		// 查询帖子
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}

		// 2. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权删除此帖子' });
		}

		// 3. 验证帖子未被锁定
		if (post.isLocked) {
			throw new ActionError({ code: 'FORBIDDEN', message: '帖子已被锁定，无法删除' });
		}

		// 已经删除的帖子
		if (post.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已被删除' });
		}

		// 4. 软删除：标记 isDeleted = true
		await prisma.post.update({
			where: { id: postId },
			data: { isDeleted: true }
		});

		// 记录删除帖子活动（异步，不阻塞主流程）
		logActivity(POST_DELETE, currentUser.userId, 'post', postId, post.userId, postId).catch(
			() => {}
		);

		// 在 Gorse 中隐藏帖子（异步，不阻塞）
		hideItem(postId).catch(() => {});

		return { id: postId };
	}
});

/**
 * 创建评论 Action
 */
export const createComment = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '评论内容不能为空'),
		parentId: z.string().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await createCommentService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 删除评论 Action（软删除）
 */
export const deleteComment = defineAction({
	input: z.object({
		commentId: z.string().min(1, '评论 ID 不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await deleteCommentService({
				userId: currentUser.userId,
				commentId: input.commentId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
