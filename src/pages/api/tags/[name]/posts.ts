/**
 * 标签聚合 API
 *
 * GET /api/tags/:name/posts — 获取标签下的帖子列表
 * 只返回 public 且未删除的帖子，支持游标分页。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取标签下的帖子列表
 *
 * 流程：
 * 1. 查询标签（不存在或已隐藏返回 404）
 * 2. 通过 PostTag 查询关联的帖子
 * 3. 只返回 public 且未删除的帖子
 * 4. 支持游标分页
 *
 * @param context - Astro API 上下文
 * @returns 帖子列表 + 分页信息
 */
export const GET: APIRoute = async (context) => {
	try {
		const name = context.params.name;
		if (!name) {
			return jsonErrorResponse('标签名不能为空');
		}

		// 查询标签，不存在或已隐藏返回 404
		const tag = await prisma.tag.findUnique({ where: { name } });
		if (!tag || tag.isHidden) {
			return jsonErrorResponse('标签不存在', 404);
		}

		// 分页参数
		const url = new URL(context.request.url);
		const cursor = url.searchParams.get('cursor') || undefined;
		const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

		// 先查询标签关联的帖子 ID（SQLite 不支持关系排序，分步查询）
		const postTags = await prisma.postTag.findMany({
			where: { tagId: tag.id },
			select: { postId: true }
		});
		const postIds = postTags.map((pt) => pt.postId);

		// 如果没有帖子，直接返回空列表
		if (postIds.length === 0) {
			return new Response(
				JSON.stringify(
					successResponse({
						tag: { id: tag.id, name: tag.name },
						items: [],
						nextCursor: null,
						hasMore: false
					})
				),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 查询帖子列表（直接在 Post 表上排序）
		const posts = await prisma.post.findMany({
			where: {
				id: { in: postIds },
				visibility: 'public',
				isDeleted: false
			},
			orderBy: [{ createdAt: 'desc' }],
			take: limit + 1,
			...(cursor && {
				cursor: { id: cursor },
				skip: 1
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
					tag: { id: tag.id, name: tag.name },
					items,
					nextCursor,
					hasMore
				})
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('获取标签帖子列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
