/**
 * 管理后台 - 解锁帖子 API
 *
 * PUT /api/admin/posts/:id/unlock — 解锁帖子
 * 需 admin 权限
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/**
 * 解锁帖子
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 验证帖子存在且已锁定
 * 3. 设置 isLocked=false, lockedBy=null, lockReason=null
 *
 * @param context - Astro API 上下文
 * @returns 操作结果
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

		// 未锁定
		if (!post.isLocked) {
			return jsonErrorResponse('帖子未被锁定');
		}

		// 解锁帖子
		await prisma.post.update({
			where: { id },
			data: {
				isLocked: false,
				lockedBy: null,
				lockReason: null
			}
		});

		return new Response(JSON.stringify(successResponse({ id, isLocked: false })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('解锁帖子失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
