/**
 * 管理后台 - 用户批量操作 API
 *
 * POST /api/admin/users/batch — 批量禁用/启用用户
 * 需 admin 权限，禁用操作会跳过 admin 角色用户
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 允许的批量操作类型 */
type UserBatchAction = 'disable' | 'enable';

/** 批量操作请求体结构 */
interface UserBatchBody {
	action: UserBatchAction;
	ids: string[];
}

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

/**
 * 用户批量操作
 *
 * 流程：
 * 1. 验证管理员权限
 * 2. 解析并验证请求体（action、ids）
 * 3. 根据操作类型执行批量更新
 *    - disable：禁用用户，跳过 admin 角色
 *    - enable：启用用户
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
		const body = (await parseJsonBody(context.request)) as UserBatchBody;
		const { action, ids } = body;

		// 验证 ids 数组
		if (!Array.isArray(ids) || ids.length === 0) {
			return jsonErrorResponse('ids 必须是非空数组');
		}
		if (ids.length > MAX_BATCH_SIZE) {
			return jsonErrorResponse(`单次最多操作 ${MAX_BATCH_SIZE} 条`);
		}

		// 验证 action
		const validActions: UserBatchAction[] = ['disable', 'enable'];
		if (!validActions.includes(action)) {
			return jsonErrorResponse(`action 必须为 ${validActions.join('/')}`);
		}

		let result: { count: number };

		if (action === 'disable') {
			// 禁用用户，排除 admin 角色防止误操作
			result = await prisma.user.updateMany({
				where: {
					id: { in: ids },
					role: { not: 'admin' }
				},
				data: { isDisabled: true }
			});
		} else {
			// 启用用户，无角色限制
			result = await prisma.user.updateMany({
				where: { id: { in: ids } },
				data: { isDisabled: false }
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
		console.error('用户批量操作失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
