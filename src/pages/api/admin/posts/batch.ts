/**
 * 管理后台 - 帖子批量操作 API
 *
 * POST /api/admin/posts/batch — 批量删除/锁定/解锁帖子
 * 需 admin 权限，删除和锁定需填写理由
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 允许的批量操作类型 */
type PostBatchAction = 'delete' | 'lock' | 'unlock';

/** 批量操作请求体结构 */
interface PostBatchBody {
	action: PostBatchAction;
	ids: string[];
	reason?: string;
}

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

/**
 * 帖子批量操作
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 解析并验证请求体（action、ids、reason）
 * 3. 根据操作类型执行批量更新
 *    - delete：软删除，需 reason
 *    - lock：锁定，需 reason
 *    - unlock：解锁
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
		const body = (await parseJsonBody(context.request)) as PostBatchBody;
		const { action, ids, reason } = body;

		// 验证 ids 数组
		if (!Array.isArray(ids) || ids.length === 0) {
			return jsonErrorResponse('ids 必须是非空数组');
		}
		if (ids.length > MAX_BATCH_SIZE) {
			return jsonErrorResponse(`单次最多操作 ${MAX_BATCH_SIZE} 条`);
		}

		// 验证 action
		const validActions: PostBatchAction[] = ['delete', 'lock', 'unlock'];
		if (!validActions.includes(action)) {
			return jsonErrorResponse(`action 必须为 ${validActions.join('/')}`);
		}

		let result: { count: number };

		if (action === 'delete') {
			// 删除操作需填写理由
			if (!reason || !reason.trim()) {
				return jsonErrorResponse('删除理由不能为空');
			}
			// 软删除：设置 isDeleted、deleteReason、deletedBy
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isDeleted: true,
					deleteReason: reason.trim(),
					deletedBy: admin.userId
				}
			});
		} else if (action === 'lock') {
			// 锁定操作需填写理由
			if (!reason || !reason.trim()) {
				return jsonErrorResponse('锁定理由不能为空');
			}
			// 锁定：设置 isLocked、lockedBy、lockReason
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isLocked: true,
					lockedBy: admin.userId,
					lockReason: reason.trim()
				}
			});
		} else {
			// 解锁：清除锁定状态
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isLocked: false,
					lockedBy: null,
					lockReason: null
				}
			});
		}

		return new Response(JSON.stringify(successResponse({ affected: result.count })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('帖子批量操作失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
