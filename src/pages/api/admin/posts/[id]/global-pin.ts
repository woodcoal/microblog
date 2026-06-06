/**
 * 管理后台 - 全局置顶帖子 API
 *
 * PUT /api/admin/posts/:id/global-pin — 切换全局置顶状态
 * 需 admin 权限，检查 MAX_GLOBAL_PINNED_POSTS 限制
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';
import { MAX_GLOBAL_PINNED_POSTS } from '@/lib/config';

/**
 * 切换全局置顶状态
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证帖子存在
 * 3. 如果要置顶，检查是否超过上限
 * 4. 切换 isGlobalPinned 状态
 *
 * @param context - Astro API 上下文
 * @returns 操作结果（当前置顶状态）
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		const { id } = context.params;
		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 验证帖子存在
		const post = await prisma.post.findUnique({ where: { id } });
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 当前未置顶 → 要置顶，检查上限
		if (!post.isGlobalPinned) {
			const pinnedCount = await prisma.post.count({
				where: { isGlobalPinned: true, isDeleted: false }
			});
			if (pinnedCount >= MAX_GLOBAL_PINNED_POSTS) {
				return jsonErrorResponse(`全局置顶帖子数量已达上限（${MAX_GLOBAL_PINNED_POSTS}）`);
			}
		}

		// 切换置顶状态
		const newPinnedState = !post.isGlobalPinned;
		await prisma.post.update({
			where: { id },
			data: { isGlobalPinned: newPinnedState }
		});

		return new Response(
			JSON.stringify(successResponse({ id, isGlobalPinned: newPinnedState })),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('切换全局置顶失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
