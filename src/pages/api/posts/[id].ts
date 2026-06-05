/**
 * 帖子详情 API
 *
 * GET    /api/posts/:id — 获取单个帖子详情
 * PUT    /api/posts/:id — 编辑帖子（需认证，仅作者）
 * DELETE /api/posts/:id — 删除帖子（需认证，仅作者，软删除）
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { getUserFromRequest, hashPassword, requireAuth } from '@/lib/auth';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { successResponse, errorResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';
import { deleteFileRef, MAX_IMAGE_COUNT } from '@/lib/upload';
import { parseMentions, parseTags } from '@/lib/parser';
import { checkPostVisibility, VALID_VISIBILITIES, type Visibility } from '@/lib/visibility';
import { logActivity, POST_UPDATE, POST_DELETE } from '@/lib/activity';

/** 需要从帖子响应中排除的敏感字段 */
const SENSITIVE_FIELDS = ['passwordHash', 'allowedUserIds'] as const;

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

/** media 关联查询的 include 配置，复用于 GET/PUT */
const mediaInclude = {
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
	}
};

/**
 * 获取单个帖子详情
 *
 * 根据 ID 查询帖子，包含作者信息。
 * 已删除的帖子返回"该内容已删除"提示。
 * 根据可见度检查当前用户是否有权查看。
 * visibility=password 且未验证密码时，返回 { needPassword: true }。
 *
 * @param context - Astro API 上下文
 * @returns 帖子详情或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		const { id } = context.params;

		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 查询帖子，包含作者信息、媒体信息、标签和提及
		const post = await prisma.post.findUnique({
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
				...mediaInclude,
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

		// 帖子不存在
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 已删除的帖子返回提示（仅返回有限信息，不暴露关联元数据）
		if (post.isDeleted) {
			return new Response(
				JSON.stringify(
					successResponse({
						id: post.id,
						content: '该内容已删除',
						isDeleted: true,
						createdAt: post.createdAt,
						userId: post.userId
					})
				),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 获取当前登录用户
		const currentUser = await getUserFromRequest(context);

		// 查询当前用户是否是帖子作者的粉丝
		let isFollower = false;
		if (currentUser && currentUser.userId !== post.userId) {
			const followRecord = await prisma.follow.findUnique({
				where: {
					followerId_followingId: {
						followerId: currentUser.userId,
						followingId: post.userId
					}
				}
			});
			isFollower = !!followRecord;
		}

		// 查询帖子作者是否关注了当前用户
		let isFollowing = false;
		if (currentUser && currentUser.userId !== post.userId) {
			const followRecord = await prisma.follow.findUnique({
				where: {
					followerId_followingId: {
						followerId: post.userId,
						followingId: currentUser.userId
					}
				}
			});
			isFollowing = !!followRecord;
		}

		// 从请求中获取密码参数（query param 或 header）
		const url = new URL(context.request.url);
		const requestPassword =
			url.searchParams.get('password') ||
			context.request.headers.get('x-post-password') ||
			undefined;

		// 检查可见度
		const visible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			currentUser ? { userId: currentUser.userId } : null,
			{
				password: requestPassword,
				isFollower,
				isFollowing
			}
		);

		if (!visible) {
			// visibility=password 且未验证密码时，返回 needPassword 标记
			if (post.visibility === 'password') {
				return new Response(
					JSON.stringify(successResponse({ needPassword: true, visibility: 'password' })),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			// 其他不可见情况返回 404（不暴露帖子存在性）
			return jsonErrorResponse('帖子不存在', 404);
		}

		return new Response(JSON.stringify(successResponse(sanitizePost(post))), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取帖子详情失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 编辑帖子
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
 *
 * @param context - Astro API 上下文
 * @returns 更新后的帖子数据或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 查询帖子
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 2. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			return jsonErrorResponse('无权编辑此帖子', 403);
		}

		// 3. 验证帖子未被锁定
		if (post.isLocked) {
			return jsonErrorResponse('帖子已被锁定，无法编辑', 403);
		}

		// 已删除的帖子不可编辑
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已删除，无法编辑', 400);
		}

		const body = await parseJsonBody(context.request);
		let { content, mediaIds, visibility, password, allowedUserIds } = body as {
			content?: string;
			mediaIds?: string[];
			visibility?: string;
			password?: string;
			allowedUserIds?: string[];
		};

		// mediaIds 去重，防止重复关联
		if (mediaIds && mediaIds.length > 0) {
			mediaIds = [...new Set(mediaIds)];
		}

		// 校验可见度值合法性（如果传了 visibility）
		if (visibility !== undefined) {
			const vis = visibility as Visibility;
			if (!VALID_VISIBILITIES.includes(vis)) {
				return jsonErrorResponse('无效的可见度类型');
			}

			// visibility=password 时，密码必填
			if (vis === 'password' && (!password || !password.trim())) {
				return jsonErrorResponse('密码保护帖子需要设置密码');
			}

			// visibility=users 时，allowedUserIds 必填且非空
			if (vis === 'users' && (!allowedUserIds || allowedUserIds.length === 0)) {
				return jsonErrorResponse('指定用户可见帖子需要选择至少一个用户');
			}
		}

		// 4. 校验内容非空
		if (!content || !content.trim()) {
			return jsonErrorResponse('帖子内容不能为空');
		}

		// 校验内容长度
		if (content.length > POST_CONTENT_MAX_LENGTH) {
			return jsonErrorResponse(`内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
		}

		// 5. 校验图片数量限制
		if (mediaIds && mediaIds.length > 0) {
			const fileStorages = await prisma.fileStorage.findMany({
				where: { id: { in: mediaIds } }
			});
			const imageCount = fileStorages.filter((f) => f.fileType === 'image').length;
			if (imageCount > MAX_IMAGE_COUNT) {
				return jsonErrorResponse(`图片最多 ${MAX_IMAGE_COUNT} 张`);
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
				where: { id },
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
					...mediaInclude,
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
		logActivity(POST_UPDATE, currentUser.userId, 'post', id, post.userId, id).catch(() => {});

		return new Response(JSON.stringify(successResponse(sanitizePost(updated))), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('编辑帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 删除帖子（软删除）
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证是帖子作者
 * 3. 验证帖子未被锁定
 * 4. 标记 isDeleted = true
 *
 * @param context - Astro API 上下文
 * @returns 成功或错误
 */
export const DELETE: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 查询帖子
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 2. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			return jsonErrorResponse('无权删除此帖子', 403);
		}

		// 3. 验证帖子未被锁定
		if (post.isLocked) {
			return jsonErrorResponse('帖子已被锁定，无法删除', 403);
		}

		// 已经删除的帖子
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已被删除', 400);
		}

		// 4. 软删除：标记 isDeleted = true
		await prisma.post.update({
			where: { id },
			data: { isDeleted: true }
		});

		// 记录删除帖子活动（异步，不阻塞主流程）
		logActivity(POST_DELETE, currentUser.userId, 'post', id, post.userId, id).catch(() => {});

		return new Response(JSON.stringify(successResponse({ id })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('删除帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
