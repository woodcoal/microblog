/**
 * 帖子点赞 API
 *
 * PUT /api/posts/:id/like — 切换点赞状态
 * 已点赞则取消，未点赞则点赞。
 * 需要登录认证。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, LIKE_CREATE, LIKE_REMOVE } from '@/lib/activity';

/**
 * 切换帖子点赞状态
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 检查帖子存在且未删除
 * 3. 查询是否已点赞，切换状态
 * 4. 返回当前点赞状态和点赞数
 *
 * @param context - Astro API 上下文
 * @returns { liked: boolean, likeCount: number } 或错误
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

		// 2. 检查帖子存在且未删除
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已删除', 400);
		}

		// 3. 查询当前点赞状态（仅用于确定操作意图）
		const existingLike = await prisma.like.findUnique({
			where: {
				userId_postId: {
					userId: currentUser.userId,
					postId: id
				}
			}
		});

		let liked: boolean;
		if (existingLike) {
			// 已点赞 → 取消：直接 delete 并 catch P2025（记录不存在），避免竞态
			try {
				await prisma.like.delete({
					where: {
						userId_postId: {
							userId: currentUser.userId,
							postId: id
						}
					}
				});
			} catch (deleteError: any) {
				// P2025 = 记录不存在，说明已被其他请求删除，忽略
				if (deleteError?.code !== 'P2025') throw deleteError;
			}
			liked = false;
			// 记录取消点赞活动（异步，不阻塞主流程）
			logActivity(LIKE_REMOVE, currentUser.userId, 'post', id, post.userId, id).catch(
				() => {}
			);
		} else {
			// 未点赞 → 点赞：使用 upsert 避免竞态，已存在则忽略
			await prisma.like.upsert({
				where: {
					userId_postId: {
						userId: currentUser.userId,
						postId: id
					}
				},
				update: {},
				create: {
					userId: currentUser.userId,
					postId: id
				}
			});
			liked = true;

			// 发送点赞通知（异步，不阻塞主流程）
			createNotification('like', currentUser.userId, post.userId, id).catch(() => {});
			// 记录点赞活动（异步，不阻塞主流程）
			logActivity(LIKE_CREATE, currentUser.userId, 'post', id, post.userId, id).catch(
				() => {}
			);
		}

		// 4. 统计当前点赞数
		const likeCount = await prisma.like.count({
			where: { postId: id }
		});

		return new Response(JSON.stringify(successResponse({ liked, likeCount })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('切换点赞失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
