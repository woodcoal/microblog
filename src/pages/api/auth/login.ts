/**
 * 用户登录 API
 *
 * POST /api/auth/login
 * 校验邮箱密码，验证通过后返回 JWT。
 * 被禁用的用户（isDisabled=true）无法登录。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { verifyPassword, generateToken, setTokenCookie } from '@/lib/auth';
import { DISABLED_USER_MESSAGE } from '@/lib/config';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/**
 * 登录接口
 *
 * 校验流程：
 * 1. 校验邮箱和密码非空
 * 2. 查找用户并验证密码
 * 3. 检查用户是否被禁用
 * 4. 生成 JWT → 设置 cookie → 返回
 *
 * @param context - Astro API 上下文
 * @returns 登录结果（token + 用户信息）或错误
 */
export const POST: APIRoute = async (context) => {
	try {
		const body = await parseJsonBody(context.request);
		const { email, password } = body as { email?: string; password?: string };

		// 校验必填字段
		if (!email || !password) {
			return jsonErrorResponse('邮箱和密码不能为空');
		}

		// 查找用户
		const user = await prisma.user.findUnique({ where: { email } });

		// 无论用户是否存在都执行 bcrypt 比较，防止时序攻击枚举有效邮箱
		const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
		const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);

		if (!user || !valid) {
			return jsonErrorResponse('邮箱或密码错误', 401);
		}

		// 检查用户是否被禁用
		if (user.isDisabled) {
			const message = DISABLED_USER_MESSAGE;
			return jsonErrorResponse(message, 403);
		}

		// 生成 JWT
		const token = await generateToken({
			userId: user.id,
			username: user.username,
			role: user.role
		});

		// 设置 HttpOnly cookie
		setTokenCookie(context, token);

		// 返回 token 和用户信息
		return new Response(
			JSON.stringify(
				successResponse({
					token,
					user: {
						id: user.id,
						username: user.username,
						displayName: user.displayName,
						email: user.email,
						role: user.role
					}
				})
			),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('登录失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
