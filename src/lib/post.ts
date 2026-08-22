/**
 * 帖子数据库操作模块
 *
 * 提供帖子的 CRUD 原子操作，供 Service 层调用。
 * 所有函数均为纯数据库操作，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';
import { hashPassword } from '@/lib/auth';

export interface PostMediaSnapshotV2 {
	version: 2;
	bodyMediaIds: string[];
	thumbnailMediaId: string | null;
	attachmentMediaIds: string[];
}

/** 将旧版 ID 数组和 v2 对象统一读取为稳定快照。 */
export function parsePostMediaSnapshot(value: string | null): PostMediaSnapshotV2 {
	if (!value) {
		return { version: 2, bodyMediaIds: [], thumbnailMediaId: null, attachmentMediaIds: [] };
	}
	try {
		const parsed: unknown = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return {
				version: 2,
				bodyMediaIds: parsed.filter((id): id is string => typeof id === 'string'),
				thumbnailMediaId: null,
				attachmentMediaIds: []
			};
		}
		if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 2) {
			const snapshot = parsed as Partial<PostMediaSnapshotV2>;
			return {
				version: 2,
				bodyMediaIds: Array.isArray(snapshot.bodyMediaIds)
					? snapshot.bodyMediaIds.filter((id): id is string => typeof id === 'string')
					: [],
				thumbnailMediaId:
					typeof snapshot.thumbnailMediaId === 'string'
						? snapshot.thumbnailMediaId
						: null,
				attachmentMediaIds: Array.isArray(snapshot.attachmentMediaIds)
					? snapshot.attachmentMediaIds.filter(
							(id): id is string => typeof id === 'string'
						)
					: []
			};
		}
	} catch {
		// 历史坏数据按空快照降级，版本正文仍可读取。
	}
	return { version: 2, bodyMediaIds: [], thumbnailMediaId: null, attachmentMediaIds: [] };
}

// ── 查询 ──

/**
 * 按 ID 查询帖子（返回完整记录）
 *
 * @param id - 帖子 ID
 * @returns 帖子完整记录，不存在则返回 null
 */
export function findPostById(id: string) {
	return prisma.post.findUnique({ where: { id } });
}

/**
 * 按 ID 查询帖子（指定 select 字段）
 *
 * @param id - 帖子 ID
 * @param select - 需要查询的字段选择器
 * @returns 指定字段的帖子记录，不存在则返回 null
 */
export function findPostByIdSelect<T extends Prisma.PostSelect>(id: string, select: T) {
	return prisma.post.findUnique({ where: { id }, select });
}

/**
 * 按 ID 列表查询帖子
 *
 * 支持 include 或 select 两种关联查询方式，二者互斥：
 * - 传入 include 时，返回包含关联数据的完整帖子记录
 * - 传入 select 时，仅返回指定字段（适用于只需要部分字段的场景）
 * - 都不传时，返回帖子全部标量字段
 *
 * @param ids - 帖子 ID 列表
 * @param where - 额外筛选条件（可选）
 * @param include - 关联查询配置（可选，与 select 互斥）
 * @param select - 字段选择器（可选，与 include 互斥）
 * @returns 匹配的帖子列表
 */
export function findPostsByIds<T extends Prisma.PostSelect>(
	ids: string[],
	where: Prisma.PostWhereInput | undefined,
	include: undefined,
	select: T
): Promise<Array<Prisma.PostGetPayload<{ select: T }>>>;
export function findPostsByIds<T extends Prisma.PostInclude>(
	ids: string[],
	where: Prisma.PostWhereInput | undefined,
	include: T,
	select?: undefined
): Promise<Array<Prisma.PostGetPayload<{ include: T }>>>;
export function findPostsByIds(
	ids: string[],
	where?: Prisma.PostWhereInput,
	include?: Prisma.PostInclude,
	select?: Prisma.PostSelect
): Promise<Array<Prisma.PostGetPayload<Prisma.PostDefaultArgs>>>;
export function findPostsByIds(
	ids: string[],
	where?: Prisma.PostWhereInput,
	include?: Prisma.PostInclude,
	select?: Prisma.PostSelect
): Promise<unknown> {
	return prisma.post.findMany({
		where: { id: { in: ids }, ...where },
		...(include ? { include } : {}),
		...(select ? { select } : {})
	});
}

/**
 * 统计帖子数量
 *
 * @param where - 筛选条件
 * @returns 符合条件的帖子数量
 */
export function countPosts(where: Prisma.PostWhereInput) {
	return prisma.post.count({ where });
}

/**
 * 搜索帖子
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 需要查询的字段选择器（可选）
 * @returns 匹配的帖子列表
 */
export function searchPosts<T extends Prisma.PostSelect>(query: string, take: number, select?: T) {
	return prisma.post.findMany({
		where: { content: { contains: query }, user: { deletedAt: null, isDisabled: false } },
		take,
		...(select ? { select } : {})
	});
}

/**
 * 搜索帖子建议
 *
 * 按标题或内容模糊匹配搜索，用于搜索框自动补全。
 * 排除已删除的帖子，按创建时间降序排列。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 需要查询的字段选择器
 * @returns 匹配的帖子列表
 */
export function searchPostsSuggest<T extends Prisma.PostSelect>(
	query: string,
	take: number,
	select: T
) {
	return prisma.post.findMany({
		where: {
			isDeleted: false,
			user: { deletedAt: null, isDisabled: false },
			OR: [{ title: { contains: query } }, { content: { contains: query } }]
		},
		orderBy: { createdAt: 'desc' },
		take,
		select
	});
}

/**
 * 查询帖子完整关联数据
 *
 * 包含 user、media+fileStorage、tags+tag、mentions+user、category 关联。
 * 用于创建/更新帖子后返回完整数据。
 *
 * @param id - 帖子 ID
 * @returns 包含完整关联的帖子记录，不存在则返回 null
 */
export function findPostWithRelations(id: string) {
	return prisma.post.findUnique({
		where: { id },
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
}

/**
 * 查询帖子的 Media 关联列表
 *
 * @param postId - 帖子 ID
 * @returns 按 sortOrder 升序排列的 Media 记录列表
 */
export function findMediaByPostId(postId: string) {
	return prisma.media.findMany({
		where: { postId },
		orderBy: { sortOrder: 'asc' }
	});
}

/** 查询 Agent 帖子列表所需的轻量字段。 */
export function findAgentPosts(
	where: Prisma.PostWhereInput,
	options: {
		take: number;
		skip?: number;
		orderBy?: Prisma.PostOrderByWithRelationInput;
		includeCounts?: boolean;
	}
) {
	return prisma.post.findMany({
		where,
		take: options.take,
		...(options.skip !== undefined ? { skip: options.skip } : {}),
		...(options.orderBy ? { orderBy: options.orderBy } : {}),
		select: {
			id: true,
			content: true,
			createdAt: true,
			...(options.includeCounts
				? { _count: { select: { likes: true, comments: true } } }
				: {})
		}
	});
}

/** 查询 Agent 帖子详情及其作者和附件。 */
export function findAgentPostDetail(postId: string) {
	return prisma.post.findFirst({
		where: { id: postId, user: { deletedAt: null, isDisabled: false } },
		include: {
			user: { select: { username: true, displayName: true } },
			media: {
				orderBy: { sortOrder: 'asc' },
				include: { fileStorage: { select: { filePath: true, fileType: true } } }
			}
		}
	});
}

/** v1 API 使用的帖子查询，始终返回 DTO 映射所需的关联数据。 */
export function findApiPosts(
	where: Prisma.PostWhereInput,
	options: {
		skip: number;
		take: number;
		orderBy: Prisma.PostOrderByWithRelationInput;
		viewerId?: string;
	}
) {
	return prisma.post.findMany({
		where,
		skip: options.skip,
		take: options.take,
		orderBy: options.orderBy,
		include: apiPostInclude(options.viewerId)
	});
}

/** 按 ID 查询 v1 API 帖子。 */
export function findApiPost(postId: string, viewerId?: string) {
	return prisma.post.findFirst({
		where: { id: postId, user: { deletedAt: null, isDisabled: false } },
		include: apiPostInclude(viewerId)
	});
}

function apiPostInclude(viewerId?: string) {
	const viewerLikeFilter = viewerId ? { userId: viewerId } : { userId: '' };
	const viewerFollowFilter = viewerId ? { followerId: viewerId } : { followerId: '' };
	return {
		user: {
			select: {
				id: true,
				username: true,
				displayName: true,
				avatarUrl: true,
				bio: true,
				createdAt: true,
				_count: {
					select: {
						posts: { where: { isDeleted: false } },
						followers: true,
						following: true
					}
				},
				followers: { where: viewerFollowFilter, select: { id: true } }
			}
		},
		media: {
			orderBy: { sortOrder: 'asc' as const },
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
		tags: { include: { tag: { select: { id: true, name: true } } } },
		likes: { where: viewerLikeFilter, select: { id: true } },
		_count: { select: { likes: true, comments: { where: { isDeleted: false } } } }
	} satisfies Prisma.PostInclude;
}

// ── 更新 ──

/**
 * 更新帖子
 *
 * @param id - 帖子 ID
 * @param data - 更新数据
 * @returns 更新后的帖子记录
 */
export function updatePost(id: string, data: Prisma.PostUpdateInput) {
	return prisma.post.update({ where: { id }, data });
}

/**
 * 软删除帖子
 *
 * 将 isDeleted 标记为 true，不物理删除记录。
 *
 * @param id - 帖子 ID
 * @returns 更新后的帖子记录
 */
export function softDeletePost(id: string) {
	return prisma.post.update({
		where: { id },
		data: { isDeleted: true }
	});
}

// ── 批量操作 ──

/**
 * 批量软删除帖子
 *
 * @param ids - 帖子 ID 列表
 * @param reason - 删除理由
 * @param operatorId - 操作者 ID
 * @returns 更新的记录数
 */
export function batchSoftDeletePosts(ids: string[], reason: string, operatorId: string) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isDeleted: true,
			deleteReason: reason,
			deletedBy: operatorId
		}
	});
}

/**
 * 批量锁定帖子
 *
 * @param ids - 帖子 ID 列表
 * @param reason - 锁定理由
 * @param operatorId - 操作者 ID
 * @returns 更新的记录数
 */
export function batchLockPosts(ids: string[], reason: string, operatorId: string) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isLocked: true,
			lockReason: reason,
			lockedBy: operatorId
		}
	});
}

/**
 * 批量解锁帖子
 *
 * @param ids - 帖子 ID 列表
 * @returns 更新的记录数
 */
export function batchUnlockPosts(ids: string[]) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isLocked: false,
			lockReason: null,
			lockedBy: null
		}
	});
}

/**
 * 批量还原被管理员软删除的帖子，并保留还原审计信息。
 */
export function batchRestorePosts(ids: string[], reason: string, operatorId: string) {
	return prisma.post.updateMany({
		where: { id: { in: ids }, isDeleted: true },
		data: {
			isDeleted: false,
			deleteReason: null,
			deletedBy: null,
			restoreReason: reason,
			restoredBy: operatorId
		}
	});
}

/**
 * 批量设置管理员全局置顶状态。已删除帖子不能进入公开置顶流。
 */
export function batchSetGlobalPinPosts(ids: string[], pinned: boolean) {
	return prisma.post.updateMany({
		where: { id: { in: ids }, isDeleted: false },
		data: { isGlobalPinned: pinned }
	});
}

// ── 事务内操作 ──

/**
 * 统计用户置顶帖子数（事务内）
 *
 * @param tx - Prisma 事务客户端
 * @param userId - 用户 ID
 * @returns 用户已置顶且未删除的帖子数量
 */
export function countPinnedPosts(tx: Prisma.TransactionClient, userId: string) {
	return tx.post.count({
		where: {
			userId,
			isPinned: true,
			isDeleted: false
		}
	});
}

/**
 * 更新帖子置顶状态（事务内）
 *
 * @param tx - Prisma 事务客户端
 * @param id - 帖子 ID
 * @param pinned - 是否置顶
 * @returns 更新后的帖子记录
 */
export function updatePostPinStatus(tx: Prisma.TransactionClient, id: string, pinned: boolean) {
	return tx.post.update({
		where: { id },
		data: { isPinned: pinned }
	});
}

/**
 * 创建帖子事务（含 media、mention、tag 关联）
 *
 * 在事务中完成：创建帖子 → 创建 Media 关联 → 创建 Mention 关联 → 创建 PostTag 关联。
 * visibility=password 时自动哈希密码，visibility=users 时序列化 allowedUserIds。
 *
 * @param data - 创建帖子事务数据
 * @param data.postData - 帖子基础数据（id, userId, content, visibility, mode, title, 分类字段）
 * @param data.mediaItems - Media 关联数据列表（fileStorageId, fileType, sortOrder）
 * @param data.mentionUsernames - 被提及的用户名列表（需查询 user 表验证存在性）
 * @param data.tagNames - 标签名称列表（需 upsert Tag 记录）
 * @param data.currentUserId - 当前用户 ID（用于排除 @自己）
 * @param data.password - 明文密码（visibility=password 时使用）
 * @param data.allowedUserIds - 允许查看的用户 ID 列表（visibility=users 时使用）
 * @returns 创建的帖子记录
 */
export async function createPostTransaction(data: {
	postData: {
		id: string;
		userId: string;
		content: string;
		visibility: string;
		mode: string;
		title?: string | null;
		categoryId?: string | null;
		customCategory?: string | null;
	};
	mediaItems: Array<{
		fileStorageId: string;
		fileType: string;
		originalName?: string;
		sortOrder: number;
		slot?: string | null;
		reservationId?: string;
	}>;
	mentionUsernames: string[];
	tagNames: string[];
	currentUserId: string;
	password?: string;
	allowedUserIds?: string[];
}) {
	const {
		postData,
		mediaItems,
		mentionUsernames,
		tagNames,
		currentUserId,
		password,
		allowedUserIds
	} = data;

	return prisma.$transaction(async (tx) => {
		// 处理可见度相关字段
		let passwordHash: string | undefined;
		let allowedUserIdsJson: string | undefined;

		// visibility=password 时，哈希密码
		if (postData.visibility === 'password' && password) {
			passwordHash = await hashPassword(password.trim());
		}

		// visibility=users 时，序列化用户 ID 列表
		if (postData.visibility === 'users' && allowedUserIds) {
			allowedUserIdsJson = JSON.stringify(allowedUserIds);
		}

		// 创建帖子
		const createdPost = await tx.post.create({
			data: {
				id: postData.id,
				userId: postData.userId,
				content: postData.content,
				visibility: postData.visibility,
				passwordHash,
				allowedUserIds: allowedUserIdsJson,
				mode: postData.mode,
				title: postData.title || null,
				categoryId: postData.categoryId || null,
				customCategory: postData.customCategory || null
			}
		});

		// 创建 Media 关联记录
		if (mediaItems.length > 0) {
			await consumeUploadReservations(tx, currentUserId, mediaItems);
			await tx.media.createMany({
				data: mediaItems.map((item) => ({
					postId: createdPost.id,
					fileStorageId: item.fileStorageId,
					fileType: item.fileType,
					originalName: item.originalName || '',
					sortOrder: item.sortOrder,
					slot: item.slot || null
				}))
			});
		}

		// 解析 @提及，验证用户存在并创建 Mention 记录
		if (mentionUsernames.length > 0) {
			const mentionedUsers = await tx.user.findMany({
				where: {
					username: { in: mentionUsernames },
					id: { not: currentUserId }
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
		if (tagNames.length > 0) {
			for (const name of tagNames) {
				const tag = await tx.tag.upsert({
					where: { name },
					update: {},
					create: { name }
				});
				await tx.postTag.create({
					data: {
						postId: createdPost.id,
						tagId: tag.id
					}
				});
			}
		}

		await tx.user.update({
			where: { id: postData.userId },
			data: { lastActiveAt: new Date() }
		});

		return createdPost;
	});
}

/**
 * 更新帖子事务（含 revision、media diff、mention/tag 重建）
 *
 * 在事务中完成：保存旧版本 → 更新帖子 → 增删 Media → 重建 Mention/PostTag。
 *
 * @param data - 更新帖子事务数据
 * @param data.postId - 帖子 ID
 * @param data.updateData - 更新数据对象
 * @param data.currentMedia - 当前帖子的 Media 关联列表
 * @param data.mediaIds - 新的 fileStorageId 列表（用于计算 diff）
 * @param data.mentionUsernames - 被提及的用户名列表
 * @param data.tagNames - 标签名称列表
 * @param data.currentUserId - 当前用户 ID
 * @returns 更新后的帖子记录（含关联）
 */
export async function updatePostTransaction(data: {
	postId: string;
	previousContent: string;
	updateData: Record<string, unknown>;
	currentMedia: Array<{
		id: string;
		fileStorageId: string;
		fileType: string;
		originalName: string;
		sortOrder: number;
		slot: string | null;
		watermarkFilePath: string | null;
	}>;
	mediaItems: Array<{
		fileStorageId: string;
		fileType: string;
		originalName?: string;
		sortOrder: number;
		slot?: string | null;
		reservationId?: string;
	}>;
	mentionUsernames: string[];
	tagNames: string[];
	currentUserId: string;
}) {
	const {
		postId,
		previousContent,
		updateData,
		currentMedia,
		mediaItems,
		mentionUsernames,
		tagNames,
		currentUserId
	} = data;

	return prisma.$transaction(async (tx) => {
		// 保存旧版本到 PostRevision（含 mediaSnapshot）
		await tx.postRevision.create({
			data: {
				postId,
				content: previousContent,
				mediaSnapshot: JSON.stringify({
					version: 2,
					bodyMediaIds: currentMedia
						.filter((m) => m.slot === null && m.fileType === 'image')
						.map((m) => m.id),
					thumbnailMediaId: currentMedia.find((m) => m.slot === 'thumbnail')?.id || null,
					attachmentMediaIds: currentMedia
						.filter((m) => m.slot === null && m.fileType === 'attachment')
						.map((m) => m.id)
				})
			}
		});

		// 更新 Media 关联：slot + 文件共同标识一个逻辑资产。
		const keyOf = (item: { fileStorageId: string; slot?: string | null }) =>
			`${item.slot || ''}:${item.fileStorageId}`;
		const desiredByKey = new Map(mediaItems.map((item) => [keyOf(item), item]));
		const currentByKey = new Map(currentMedia.map((item) => [keyOf(item), item]));
		const toDelete = currentMedia.filter((item) => !desiredByKey.has(keyOf(item)));
		const releasedWatermarkFilePaths = toDelete.map((item) => item.watermarkFilePath);
		const toAdd = mediaItems.filter((item) => !currentByKey.has(keyOf(item)));

		// 删除旧的 Media 关联
		if (toDelete.length > 0) {
			await tx.media.deleteMany({
				where: { id: { in: toDelete.map((m) => m.id) } }
			});
			for (const item of toDelete) {
				const decremented = await tx.fileStorage.updateMany({
					where: { id: item.fileStorageId, refCount: { gt: 0 } },
					data: { refCount: { decrement: 1 } }
				});
				if (decremented.count !== 1) throw new Error('文件引用计数不一致');
			}
		}

		// 创建新的 Media 关联
		if (toAdd.length > 0) {
			await consumeUploadReservations(tx, currentUserId, toAdd);
			await tx.media.createMany({
				data: toAdd.map((item) => ({
					postId,
					fileStorageId: item.fileStorageId,
					fileType: item.fileType,
					originalName: item.originalName || '',
					sortOrder: item.sortOrder,
					slot: item.slot || null
				}))
			});
		}
		for (const item of mediaItems) {
			const existing = currentByKey.get(keyOf(item));
			if (existing) {
				await tx.media.update({
					where: { id: existing.id },
					data: {
						sortOrder: item.sortOrder,
						originalName: item.originalName || existing.originalName
					}
				});
			}
		}

		// 更新帖子内容
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

		// 重建 @提及和 #标签关联
		// 删除旧的 PostTag 和 Mention 记录
		await tx.postTag.deleteMany({ where: { postId } });
		await tx.mention.deleteMany({ where: { postId } });

		// 重新创建 Mention 记录
		if (mentionUsernames.length > 0) {
			const mentionedUsers = await tx.user.findMany({
				where: {
					username: { in: mentionUsernames },
					id: { not: currentUserId }
				},
				select: { id: true }
			});
			if (mentionedUsers.length > 0) {
				await tx.mention.createMany({
					data: mentionedUsers.map((u) => ({
						postId,
						userId: u.id
					}))
				});
			}
		}

		// 重新创建 PostTag 关联
		if (tagNames.length > 0) {
			for (const name of tagNames) {
				const tag = await tx.tag.upsert({
					where: { name },
					update: {},
					create: { name }
				});
				await tx.postTag.create({
					data: { postId, tagId: tag.id }
				});
			}
		}

		return {
			post: updatedPost,
			releasedFileStorageIds: toDelete.map((m) => m.fileStorageId),
			releasedWatermarkFilePaths,
			addedMediaIds: toAdd.map((item) => `${item.slot || ''}:${item.fileStorageId}`)
		};
	});
}

type ReservationMediaItem = {
	fileStorageId: string;
	fileType: string;
	reservationId?: string;
};

/** 在同一内容事务内以 compare-and-set 消费当前用户的有效上传凭证。 */
async function consumeUploadReservations(
	tx: Prisma.TransactionClient,
	userId: string,
	items: ReservationMediaItem[]
): Promise<void> {
	const now = new Date();
	for (const item of items) {
		if (!item.reservationId) continue;
		const consumed = await tx.uploadReservation.updateMany({
			where: {
				id: item.reservationId,
				userId,
				fileStorageId: item.fileStorageId,
				fileType: item.fileType,
				expiresAt: { gt: now },
				consumedAt: null,
				cancelledAt: null
			},
			data: { consumedAt: now }
		});
		if (consumed.count !== 1) {
			const { ServiceError } = await import('@/lib/errors');
			throw new ServiceError('BAD_REQUEST', '上传凭证无效、已过期或已被消费');
		}
	}
}

/**
 * 置顶切换事务
 *
 * 在事务内检查置顶数量上限后切换置顶状态，保证原子性。
 * 如果当前未置顶且已达上限，抛出 ServiceError。
 *
 * @param userId - 用户 ID
 * @param postId - 帖子 ID
 * @param currentPinned - 当前是否已置顶
 * @param maxPinned - 最大置顶数量
 * @returns 切换后的置顶状态
 */
export async function togglePostPinTransaction(
	userId: string,
	postId: string,
	currentPinned: boolean,
	maxPinned: number
): Promise<boolean> {
	const { ServiceError } = await import('@/lib/errors');

	return prisma.$transaction(async (tx) => {
		// 如果要置顶（当前未置顶），检查用户已置顶数量是否达上限
		if (!currentPinned) {
			const pinnedCount = await countPinnedPosts(tx, userId);
			if (pinnedCount >= maxPinned) {
				throw new ServiceError('BAD_REQUEST', '置顶数量已达上限');
			}
		}

		// 切换置顶状态
		const pinned = !currentPinned;
		await updatePostPinStatus(tx, postId, pinned);
		return pinned;
	});
}
