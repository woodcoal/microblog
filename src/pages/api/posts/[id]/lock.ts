/**
 * 帖子锁定 API
 *
 * PUT /api/posts/:id/lock — 切换用户帖子锁定状态
 * 已锁定则解锁，未锁定则锁定。
 * 需要登录认证，仅帖子作者可操作。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 切换帖子锁定状态
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证帖子存在且未删除
 * 3. 验证是帖子作者（只有作者可以锁定/解锁自己的帖子）
 * 4. 切换 isLocked 状态
 * 5. 返回当前锁定状态
 *
 * @param context - Astro API 上下文
 * @returns { locked: boolean } 或错误
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

		// 3. 验证是帖子作者（只有作者可以锁定/解锁自己的帖子）
		if (post.userId !== currentUser.userId) {
			return jsonErrorResponse('无权锁定此帖子', 403);
		}

		// 4. 切换锁定状态
		const newLocked = !post.isLocked;
		await prisma.post.update({
			where: { id },
			data: { isLocked: newLocked }
		});

		// 5. 返回当前锁定状态
		return new Response(JSON.stringify(successResponse({ locked: newLocked })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('切换锁定失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
