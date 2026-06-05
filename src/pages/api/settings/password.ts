/**
 * 密码修改 API
 *
 * PUT /api/settings/password — 修改当前用户密码
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth, verifyPassword, hashPassword } from '@/lib/auth';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 新密码最小长度 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * 修改密码
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 验证旧密码正确性
 * 3. 验证新密码长度（至少8字符）
 * 4. 更新密码哈希
 *
 * @param context - Astro API 上下文
 * @returns 成功或错误响应
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { oldPassword, newPassword } = body as {
			oldPassword?: string;
			newPassword?: string;
		};

		// 2. 验证必填字段
		if (!oldPassword || !newPassword) {
			return jsonErrorResponse('旧密码和新密码不能为空');
		}

		// 3. 验证新密码长度
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return jsonErrorResponse(`新密码至少 ${MIN_PASSWORD_LENGTH} 个字符`);
		}

		// 4. 查询用户当前密码哈希
		const user = await prisma.user.findUnique({
			where: { id: currentUser.userId },
			select: { passwordHash: true }
		});

		if (!user) {
			return jsonErrorResponse('用户不存在', 404);
		}

		// 5. 验证旧密码正确性
		const isOldPasswordValid = await verifyPassword(oldPassword, user.passwordHash);
		if (!isOldPasswordValid) {
			return jsonErrorResponse('旧密码不正确');
		}

		// 6. 生成新密码哈希并更新
		const newPasswordHash = await hashPassword(newPassword);
		await prisma.user.update({
			where: { id: currentUser.userId },
			data: { passwordHash: newPasswordHash }
		});

		// 7. 返回成功
		return new Response(JSON.stringify(successResponse({ message: '密码修改成功' })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('修改密码失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
