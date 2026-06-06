/**
 * Astro Actions 入口
 *
 * 定义所有服务端 Actions，替代传统 REST API 路由。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 * 当前包含：toggleLike、toggleFollow、createPost、updatePost、deletePost、createComment、deleteComment。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest, hashPassword } from '@/lib/auth';
import { createNotification } from '@/lib/notification';
import {
	logActivity,
	LIKE_CREATE,
	LIKE_REMOVE,
	FOLLOW_CREATE,
	FOLLOW_REMOVE,
	POST_CREATE,
	POST_UPDATE,
	POST_DELETE,
	COMMENT_CREATE,
	COMMENT_DELETE
} from '@/lib/activity';
import { generateShortId } from '@/lib/shortid';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { deleteFileRef, MAX_IMAGE_COUNT, saveFile } from '@/lib/upload';
import { parseMentions, parseTags } from '@/lib/parser';
import { VALID_VISIBILITIES, type Visibility } from '@/lib/visibility';

/** 需要从帖子响应中排除的敏感字段 */
const SENSITIVE_FIELDS = ['passwordHash', 'allowedUserIds'] as const;

/** 评论内容最大长度 */
const COMMENT_MAX_LENGTH = 1000;

/**
 * 从帖子对象中移除敏感字段
 *
 * 过滤 passwordHash 和 allowedUserIds，防止通过 API 泄露。
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

/**
 * 切换点赞 Action
 *
 * 对帖子或评论进行点赞/取消点赞切换操作。
 * 已点赞则取消，未点赞则点赞。
 * 需要登录认证。
 *
 * @param input - { targetId: 目标ID, type: 'post' | 'comment' }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { liked: boolean, likeCount: number } 当前点赞状态和点赞数
 */
const toggleLike = defineAction({
	input: z.object({
		targetId: z.string().min(1, '目标 ID 不能为空'),
		type: z.enum(['post', 'comment'])
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { targetId, type } = input;

		// 2. 根据类型检查目标存在且未删除
		if (type === 'post') {
			const post = await prisma.post.findUnique({ where: { id: targetId } });
			if (!post) {
				throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
			}
			if (post.isDeleted) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除' });
			}
		} else {
			const comment = await prisma.comment.findUnique({ where: { id: targetId } });
			if (!comment) {
				throw new ActionError({ code: 'NOT_FOUND', message: '评论不存在' });
			}
			if (comment.isDeleted) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '评论已删除' });
			}
		}

		// 3. 查询当前点赞状态（仅用于确定操作意图）
		const whereClause =
			type === 'post'
				? { userId_postId: { userId: currentUser.userId, postId: targetId } }
				: { userId_commentId: { userId: currentUser.userId, commentId: targetId } };

		const existingLike = await prisma.like.findUnique({ where: whereClause });

		let liked: boolean;
		if (existingLike) {
			// 已点赞 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.like.delete({ where: whereClause });
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			liked = false;

			// 记录取消点赞活动（异步，不阻塞主流程）
			if (type === 'post') {
				const post = await prisma.post.findUnique({
					where: { id: targetId },
					select: { userId: true }
				});
				if (post) {
					logActivity(
						LIKE_REMOVE,
						currentUser.userId,
						'post',
						targetId,
						post.userId,
						targetId
					).catch(() => {});
				}
			} else {
				const comment = await prisma.comment.findUnique({
					where: { id: targetId },
					select: { userId: true, postId: true }
				});
				if (comment) {
					logActivity(
						LIKE_REMOVE,
						currentUser.userId,
						'comment',
						targetId,
						comment.userId,
						comment.postId
					).catch(() => {});
				}
			}
		} else {
			// 未点赞 → 点赞：使用 upsert 避免竞态，已存在则忽略
			const createData =
				type === 'post'
					? { userId: currentUser.userId, postId: targetId }
					: { userId: currentUser.userId, commentId: targetId };

			await prisma.like.upsert({
				where: whereClause,
				update: {},
				create: createData
			});
			liked = true;

			// 发送点赞通知 + 记录活动（异步，不阻塞主流程）
			if (type === 'post') {
				const post = await prisma.post.findUnique({
					where: { id: targetId },
					select: { userId: true }
				});
				if (post) {
					createNotification('like', currentUser.userId, post.userId, targetId).catch(
						() => {}
					);
					logActivity(
						LIKE_CREATE,
						currentUser.userId,
						'post',
						targetId,
						post.userId,
						targetId
					).catch(() => {});
				}
			} else {
				const comment = await prisma.comment.findUnique({
					where: { id: targetId },
					select: { userId: true, postId: true }
				});
				if (comment) {
					createNotification(
						'like',
						currentUser.userId,
						comment.userId,
						comment.postId,
						comment.id
					).catch(() => {});
					logActivity(
						LIKE_CREATE,
						currentUser.userId,
						'comment',
						targetId,
						comment.userId,
						comment.postId
					).catch(() => {});
				}
			}
		}

		// 4. 统计当前点赞数
		const likeCount = await prisma.like.count({
			where: type === 'post' ? { postId: targetId } : { commentId: targetId }
		});

		return { liked, likeCount };
	}
});

/**
 * 切换关注 Action
 *
 * 对目标用户进行关注/取关切换操作。
 * 已关注则取关，未关注则关注。
 * 需要登录认证，不能关注自己。
 *
 * @param input - { username: 目标用户名 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { following: boolean, followerCount: number } 当前关注状态和粉丝数
 */
const toggleFollow = defineAction({
	input: z.object({
		username: z.string().min(1, '用户名不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { username } = input;

		// 2. 检查目标用户存在
		const targetUser = await prisma.user.findUnique({
			where: { username },
			select: { id: true }
		});
		if (!targetUser) {
			throw new ActionError({ code: 'NOT_FOUND', message: '用户不存在' });
		}

		// 3. 不能关注自己
		if (targetUser.id === currentUser.userId) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '不能关注自己' });
		}

		// 4. 查询当前关注状态（仅用于确定操作意图）
		const existingFollow = await prisma.follow.findUnique({
			where: {
				followerId_followingId: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			}
		});

		let following: boolean;
		if (existingFollow) {
			// 已关注 → 取关：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.follow.delete({
					where: {
						followerId_followingId: {
							followerId: currentUser.userId,
							followingId: targetUser.id
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			following = false;

			// 记录取关活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_REMOVE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		} else {
			// 未关注 → 关注：使用 upsert 避免竞态，已存在则忽略
			await prisma.follow.upsert({
				where: {
					followerId_followingId: {
						followerId: currentUser.userId,
						followingId: targetUser.id
					}
				},
				update: {},
				create: {
					followerId: currentUser.userId,
					followingId: targetUser.id
				}
			});
			following = true;

			// 发送关注通知（异步，不阻塞主流程）
			createNotification('follow', currentUser.userId, targetUser.id).catch(() => {});
			// 记录关注活动（异步，不阻塞主流程）
			logActivity(
				FOLLOW_CREATE,
				currentUser.userId,
				'user',
				targetUser.id,
				targetUser.id
			).catch(() => {});
		}

		// 5. 统计目标用户粉丝数
		const followerCount = await prisma.follow.count({
			where: { followingId: targetUser.id }
		});

		return { following, followerCount };
	}
});

/**
 * 创建帖子 Action
 *
 * 流程：
 * 1. 验证用户登录状态
 * 2. 校验内容非空和长度限制
 * 3. 校验可见度合法性
 * 4. 校验 mediaIds（图片数量限制）
 * 5. 生成 8 位短链 ID
 * 6. 事务中创建帖子 + Media 关联 + Mention + PostTag
 * 7. 异步发送 @提及通知 + 记录活动日志
 *
 * @param input - { content: 内容, visibility?: 可见度, mediaIds?: 媒体ID列表, password?: 密码, allowedUserIds?: 允许用户ID列表 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的帖子数据（含 user、media、tags、mentions）
 */
const createPost = defineAction({
	input: z.object({
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		let { content, visibility, mediaIds, password, allowedUserIds } = input;

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
					allowedUserIds: allowedUserIdsJson
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

		// 重新查询帖子以获取完整的关联数据（tags、mentions）
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

		return sanitizePost(fullPost || post);
	}
});

/**
 * 编辑帖子 Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证是帖子作者
 * 3. 验证帖子未被锁定
 * 4. 校验内容非空和长度限制
 * 5. 校验 mediaIds（图片数量限制）
 * 6. 保存旧版本到 PostRevision（含 mediaSnapshot）
 * 7. 更新内容，标记 isEdited = true
 * 8. 更新 Media 关联（删除旧的，创建新的）
 * 9. 删除的 Media 对应的 FileStorage refCount - 1
 * 10. 重建 Mention/PostTag
 *
 * @param input - { postId: 帖子ID, content: 内容, visibility?: 可见度, mediaIds?: 媒体ID列表, password?: 密码, allowedUserIds?: 允许用户ID列表 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的帖子数据
 */
const updatePost = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId, content, visibility, password, allowedUserIds } = input;
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

		return sanitizePost(updated);
	}
});

/**
 * 删除帖子 Action（软删除）
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证是帖子作者
 * 3. 验证帖子未被锁定
 * 4. 标记 isDeleted = true
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { id: string } 被删除的帖子 ID
 */
const deletePost = defineAction({
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

		return { id: postId };
	}
});

/**
 * 创建评论 Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证帖子存在、未删除、未锁定
 * 3. 校验内容非空且不超过最大长度
 * 4. 如果是二级评论，验证 parentId 属于同一帖子
 * 5. 创建评论记录
 * 6. 异步发送通知 + 记录活动日志
 *
 * @param input - { postId: 帖子ID, content: 内容, parentId?: 父评论ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的评论数据（含 user、likeCount=0、liked=false）
 */
const createComment = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '评论内容不能为空'),
		parentId: z.string().optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId, content, parentId } = input;

		// 2. 验证帖子存在、未删除、未锁定
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}
		if (post.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除，无法评论' });
		}
		if (post.isLocked) {
			throw new ActionError({ code: 'FORBIDDEN', message: '帖子已锁定，无法评论' });
		}

		// 3. 校验内容
		if (!content || !content.trim()) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '评论内容不能为空' });
		}
		if (content.length > COMMENT_MAX_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `评论不能超过 ${COMMENT_MAX_LENGTH} 个字符`
			});
		}

		// 4. 验证 parentId 属于同一帖子
		if (parentId) {
			const parentComment = await prisma.comment.findUnique({
				where: { id: parentId }
			});
			if (!parentComment) {
				throw new ActionError({ code: 'NOT_FOUND', message: '回复的评论不存在' });
			}
			if (parentComment.postId !== postId) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '回复的评论不属于该帖子' });
			}
			// 不允许回复二级评论（只支持两级）
			if (parentComment.parentId) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '不支持多级嵌套回复' });
			}
		}

		// 5. 创建评论
		const comment = await prisma.comment.create({
			data: {
				postId,
				userId: currentUser.userId,
				parentId: parentId || null,
				content: content.trim()
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
						displayName: true,
						avatarUrl: true
					}
				}
			}
		});

		// 6. 异步通知 + 活动日志
		// 发送评论通知（异步，不阻塞主流程）
		createNotification('comment', currentUser.userId, post.userId, postId, comment.id).catch(
			() => {}
		);
		// 记录发表评论活动（异步，不阻塞主流程）
		logActivity(
			COMMENT_CREATE,
			currentUser.userId,
			'comment',
			comment.id,
			post.userId,
			postId
		).catch(() => {});

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
});

/**
 * 删除评论 Action（软删除）
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证评论存在
 * 3. 验证是评论作者
 * 4. 标记 isDeleted = true
 *
 * @param input - { commentId: 评论ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { id: string } 被删除的评论 ID
 */
const deleteComment = defineAction({
	input: z.object({
		commentId: z.string().min(1, '评论 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { commentId } = input;

		// 2. 验证评论存在
		const comment = await prisma.comment.findUnique({ where: { id: commentId } });
		if (!comment) {
			throw new ActionError({ code: 'NOT_FOUND', message: '评论不存在' });
		}

		// 3. 验证是评论作者
		if (comment.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权删除此评论' });
		}

		// 已删除的评论
		if (comment.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '评论已被删除' });
		}

		// 4. 软删除
		await prisma.comment.update({
			where: { id: commentId },
			data: { isDeleted: true }
		});

		// 记录删除评论活动（异步，不阻塞主流程）
		logActivity(
			COMMENT_DELETE,
			currentUser.userId,
			'comment',
			commentId,
			comment.userId,
			comment.postId
		).catch(() => {});

		return { id: commentId };
	}
});

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
const uploadMedia = defineAction({
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
		const { fileStorage } = await saveFile(file, fileType);

		// 3. 返回文件信息
		return {
			id: fileStorage.id,
			url: `/uploads/${fileStorage.filePath}`,
			fileType: fileStorage.fileType,
			originalName: file.name,
			fileSize: fileStorage.fileSize
		};
	}
});

/**
 * 按用户名搜索用户 Action
 *
 * 根据逗号分隔的用户名列表查询匹配的用户（精确匹配）。
 * 用于 visibility=users 时查找指定用户 ID。
 * 需要登录认证。
 *
 * @param input - { usernames: 用户名数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 用户列表（id、username、displayName、avatarUrl）
 */
const searchUsers = defineAction({
	input: z.object({
		usernames: z.array(z.string().min(1)).min(1, '至少输入一个用户名')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { usernames } = input;

		// 2. 精确匹配用户名，排除被禁用的用户
		const users = await prisma.user.findMany({
			where: {
				username: { in: usernames },
				isDisabled: false
			},
			select: {
				id: true,
				username: true,
				displayName: true,
				avatarUrl: true
			}
		});

		return { items: users };
	}
});

/** 导出所有服务端 Actions */
export const server = {
	toggleLike,
	toggleFollow,
	createPost,
	updatePost,
	deletePost,
	createComment,
	deleteComment,
	uploadMedia,
	searchUsers
};
