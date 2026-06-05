/**
 * 用户注册 API
 *
 * POST /api/auth/register
 * 校验用户名、邮箱、密码，创建用户并返回 JWT。
 * 当 ALLOW_REGISTRATION = false 时返回 403。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { hashPassword, generateToken, setTokenCookie } from '@/lib/auth';
import {
	RESERVED_USERNAMES,
	USERNAME_PATTERN,
	PASSWORD_MIN_LENGTH,
	ALLOW_REGISTRATION
} from '@/lib/config';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 邮箱格式正则 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 注册接口
 *
 * 校验流程：
 * 1. 检查站点是否开放注册
 * 2. 校验必填字段（username, email, password）
 * 3. 校验用户名格式和保留词
 * 4. 校验密码长度
 * 5. 检查邮箱和用户名唯一性
 * 6. 哈希密码 → 创建用户 → 生成 JWT → 设置 cookie
 *
 * @param context - Astro API 上下文
 * @returns 注册结果（token + 用户信息）或错误
 */
export const POST: APIRoute = async (context) => {
	try {
		// 检查站点是否开放注册
		if (!ALLOW_REGISTRATION) {
			return jsonErrorResponse('注册已关闭', 403);
		}

		const body = await parseJsonBody(context.request);
		const { username, displayName, email, password } = body as {
			username?: string;
			displayName?: string;
			email?: string;
			password?: string;
		};

		// 校验必填字段
		if (!username || !email || !password) {
			return jsonErrorResponse('用户名、邮箱和密码不能为空');
		}

		// 校验邮箱格式
		if (!EMAIL_PATTERN.test(email)) {
			return jsonErrorResponse('邮箱格式无效');
		}

		// 校验用户名格式
		if (!USERNAME_PATTERN.test(username)) {
			return jsonErrorResponse('用户名只能包含字母、数字和下划线，长度 3-20 个字符');
		}

		// 校验保留用户名
		if (
			RESERVED_USERNAMES.includes(
				username.toLowerCase() as (typeof RESERVED_USERNAMES)[number]
			)
		) {
			return jsonErrorResponse('该用户名为系统保留，无法使用');
		}

		// 校验密码长度
		if (password.length < PASSWORD_MIN_LENGTH) {
			return jsonErrorResponse(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
		}

		// 检查邮箱和用户名是否已存在（合并提示，防止枚举攻击）
		const [existingEmail, existingUsername] = await Promise.all([
			prisma.user.findUnique({ where: { email } }),
			prisma.user.findUnique({ where: { username } })
		]);
		if (existingEmail || existingUsername) {
			return jsonErrorResponse('注册信息已存在，请更换邮箱或用户名');
		}

		// 哈希密码
		const passwordHash = await hashPassword(password);

		// 创建用户
		const user = await prisma.user.create({
			data: {
				username,
				displayName: displayName || username,
				email,
				passwordHash
			}
		});

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
			{ status: 201, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('注册失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
