/**
 * 帖子版本历史 API
 *
 * GET /api/posts/:id/revisions — 获取帖子的版本历史列表（仅作者可查看）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 获取帖子的版本历史列表
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证帖子存在
 * 3. 验证是帖子作者
 * 4. 按时间倒序返回版本列表
 *
 * @param context - Astro API 上下文
 * @returns 版本历史列表或错误
 */
export const GET: APIRoute = async (context) => {
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

		// 2. 验证帖子存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 3. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			return jsonErrorResponse('无权查看此帖子的版本历史', 403);
		}

		// 4. 按时间倒序返回版本列表
		const revisions = await prisma.postRevision.findMany({
			where: { postId: id },
			orderBy: { createdAt: 'desc' }
		});

		return new Response(JSON.stringify(successResponse(revisions)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取版本历史失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
