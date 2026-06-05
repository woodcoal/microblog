/**
 * 帖子列表 API
 *
 * GET  /api/posts      — 获取公开帖子列表（游标分页）
 * POST /api/posts      — 创建新帖子（需认证）
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth, hashPassword } from '@/lib/auth';
import { generateShortId } from '@/lib/shortid';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';
import { MAX_IMAGE_COUNT } from '@/lib/upload';
import { parseMentions, parseTags } from '@/lib/parser';
import { VALID_VISIBILITIES, type Visibility } from '@/lib/visibility';
import { createNotification } from '@/lib/notification';
import { logActivity, POST_CREATE } from '@/lib/activity';

/** 需要从帖子响应中排除的敏感字段 */
const SENSITIVE_FIELDS = ['passwordHash', 'allowedUserIds'] as const;

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

/**
 * 获取公开帖子列表
 *
 * 查询条件：visibility=public, isDeleted=false
 * 按创建时间倒序排列，支持游标分页。
 *
 * @param context - Astro API 上下文
 * @returns 帖子列表 + 分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		const url = new URL(context.request.url);
		// 分页参数
		const cursor = url.searchParams.get('cursor') || undefined;
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

		// 构建查询条件：公开 + 未删除
		const where = {
			visibility: 'public',
			isDeleted: false
		};

		// 查询帖子列表
		const posts = await prisma.post.findMany({
			where,
			orderBy: [{ createdAt: 'desc' }],
			take: limit + 1, // 多取一条用于判断是否有下一页
			...(cursor && {
				cursor: { id: cursor },
				skip: 1 // 跳过游标本身
			}),
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
				}
			}
		});

		// 判断是否有下一页
		const hasMore = posts.length > limit;
		const items = hasMore ? posts.slice(0, limit) : posts;
		const nextCursor = hasMore ? items[items.length - 1].id : null;

		return new Response(
			JSON.stringify(
				successResponse({
					items,
					nextCursor,
					hasMore
				})
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取帖子列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 创建新帖子
 *
 * 流程：
 * 1. 验证用户登录状态
 * 2. 校验内容非空和长度限制
 * 3. 校验 mediaIds（图片数量限制）
 * 4. 生成 8 位短链 ID
 * 5. 存储原始 Markdown 内容
 * 6. 创建 Media 关联记录
 * 7. 返回帖子数据（含用户信息和媒体信息）
 *
 * @param context - Astro API 上下文
 * @returns 创建的帖子数据或错误
 */
export const POST: APIRoute = async (context) => {
	try {
		// 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		let { content, visibility, mediaIds, password, allowedUserIds } = body as {
			content?: string;
			visibility?: string;
			mediaIds?: string[];
			password?: string;
			allowedUserIds?: string[];
		};

		// mediaIds 去重，防止重复关联
		if (mediaIds && mediaIds.length > 0) {
			mediaIds = [...new Set(mediaIds)];
		}

		// 校验可见度值合法性
		const vis = (visibility || 'public') as Visibility;
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

		// 校验内容非空
		if (!content || !content.trim()) {
			return jsonErrorResponse('帖子内容不能为空');
		}

		// 校验内容长度
		if (content.length > POST_CONTENT_MAX_LENGTH) {
			return jsonErrorResponse(`内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
		}

		// 校验图片数量限制（按 mediaIds 数组中图片类型计数，而非去重后的 FileStorage 数量）
		if (mediaIds && mediaIds.length > 0) {
			const fileStorages = await prisma.fileStorage.findMany({
				where: { id: { in: mediaIds } }
			});
			const fileTypeMap = new Map(fileStorages.map((f) => [f.id, f.fileType]));
			const imageCount = mediaIds.filter((id) => fileTypeMap.get(id) === 'image').length;
			if (imageCount > MAX_IMAGE_COUNT) {
				return jsonErrorResponse(`图片最多 ${MAX_IMAGE_COUNT} 张`);
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

		return new Response(JSON.stringify(successResponse(sanitizePost(fullPost || post))), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('创建帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
