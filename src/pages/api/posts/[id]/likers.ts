/**
 * 帖子点赞用户列表 API
 *
 * GET /api/posts/:id/likers — 获取点赞该帖子的用户列表
 * 返回用户昵称和用户名，用于朋友圈风格展示。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取帖子点赞用户列表
 *
 * @param context - Astro API 上下文
 * @returns 点赞用户数组 [{ username, displayName }] 或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 查询帖子是否存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 查询点赞用户列表
		const likes = await prisma.like.findMany({
			where: { postId: id },
			include: {
				user: {
					select: {
						username: true,
						displayName: true,
						avatarUrl: true
					}
				}
			},
			orderBy: { createdAt: 'desc' }
		});

		const users = likes.map((l) => l.user);

		return new Response(JSON.stringify(successResponse(users)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取点赞用户列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
