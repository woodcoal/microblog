/**
 * 管理后台 - 评论批量操作 API
 *
 * POST /api/admin/comments/batch — 批量删除评论（软删除）
 * 需 admin 权限
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 允许的批量操作类型 */
type CommentBatchAction = 'delete';

/** 批量操作请求体结构 */
interface CommentBatchBody {
	action: CommentBatchAction;
	ids: string[];
}

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

/**
 * 评论批量操作
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 解析并验证请求体（action、ids）
 * 3. 目前仅支持 delete 操作，软删除评论
 * 4. 返回受影响数量
 *
 * @param context - Astro API 上下文
 * @returns 操作结果，包含受影响条数
 */
export const POST: APIRoute = async (context) => {
	try {
		// 验证管理员权限
		const admin = await requireAdmin(context);
		if (admin instanceof Response) return admin;

		// 解析请求体
		const body = (await parseJsonBody(context.request)) as CommentBatchBody;
		const { action, ids } = body;

		// 验证 ids 数组
		if (!Array.isArray(ids) || ids.length === 0) {
			return jsonErrorResponse('ids 必须是非空数组');
		}
		if (ids.length > MAX_BATCH_SIZE) {
			return jsonErrorResponse(`单次最多操作 ${MAX_BATCH_SIZE} 条`);
		}

		// 验证 action（目前仅支持 delete）
		if (action !== 'delete') {
			return jsonErrorResponse('action 必须为 delete');
		}

		// 软删除评论：设置 isDeleted = true
		const result = await prisma.comment.updateMany({
			where: { id: { in: ids } },
			data: { isDeleted: true }
		});

		return new Response(JSON.stringify(successResponse({ affected: result.count })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('评论批量操作失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
