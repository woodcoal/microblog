/**
 * 帖子置顶 API
 *
 * PUT /api/posts/:id/pin — 切换用户置顶状态
 * 已置顶则取消，未置顶则置顶。
 * 需要登录认证，仅帖子作者可操作。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { MAX_USER_PINNED_POSTS } from '@/lib/config';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 切换帖子置顶状态
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证帖子存在且未删除
 * 3. 验证是帖子作者
 * 4. 检查置顶功能是否开启（MAX_USER_PINNED_POSTS > 0）
 * 5. 如果要置顶：检查用户已置顶数量是否达上限
 * 6. 切换 isPinned 状态
 * 7. 返回当前置顶状态
 *
 * @param context - Astro API 上下文
 * @returns { pinned: boolean } 或错误
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

		// 2. 验证帖子存在且未删除
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}
		if (post.isDeleted) {
			return jsonErrorResponse('帖子已删除', 400);
		}

		// 3. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			return jsonErrorResponse('无权置顶此帖子', 403);
		}

		// 4. 检查置顶功能是否开启
		if (MAX_USER_PINNED_POSTS === 0) {
			return jsonErrorResponse('置顶功能已关闭', 400);
		}

		// 5-6. 使用事务保证置顶数量检查与更新的原子性
		const newPinned = await prisma.$transaction(async (tx) => {
			// 如果要置顶（当前未置顶），检查用户已置顶数量是否达上限
			if (!post.isPinned) {
				const pinnedCount = await tx.post.count({
					where: {
						userId: currentUser.userId,
						isPinned: true,
						isDeleted: false
					}
				});
				if (pinnedCount >= MAX_USER_PINNED_POSTS) {
					throw Object.assign(new Error('置顶数量已达上限'), { status: 400 });
				}
			}

			// 切换置顶状态
			const pinned = !post.isPinned;
			await tx.post.update({
				where: { id },
				data: { isPinned: pinned }
			});
			return pinned;
		});

		// 7. 返回当前置顶状态
		return new Response(JSON.stringify(successResponse({ pinned: newPinned })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理事务中抛出的 400 错误（如置顶数量上限）
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('切换置顶失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
