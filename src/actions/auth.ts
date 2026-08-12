/**
 * 认证 Actions
 *
 * 提供用户登录、注册、登出的服务端 Actions。
 * 业务逻辑委托 auth.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { generateToken, setTokenCookie, clearTokenCookie } from '@/lib/auth';
import { consumeEmailVerificationToken, resendEmailVerification } from '@/lib/email-verification';
import { ServiceError } from '@/lib/errors';
import {
	registerUser as registerUserService,
	loginUser as loginUserService
} from '@/services/auth.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 用户登录 Action
 */
const login = defineAction({
	input: z.object({
		email: z.string().min(1, '邮箱不能为空'),
		password: z.string().min(1, '密码不能为空')
	}),
	handler: async (input, context) => {
		try {
			const user = await loginUserService(input);

			const token = await generateToken({
				userId: user.id,
				username: user.username,
				role: user.role
			});
			setTokenCookie(context, token);
			return {
				token,
				user: {
					id: user.id,
					username: user.username,
					displayName: user.displayName,
					avatarUrl: user.avatarUrl,
					role: user.role
				}
			};
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 用户注册 Action
 */
const register = defineAction({
	input: z.object({
		username: z.string().optional(),
		displayName: z.string().optional(),
		email: z.string().min(1, '邮箱不能为空'),
		password: z.string().min(1, '密码不能为空')
	}),
	handler: async (input) => {
		try {
			await registerUserService(input);

			return {
				accepted: true,
				message: '若邮箱可用，验证邮件已发送'
			};
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/** 消费一次性邮箱验证令牌；无效、过期和重放使用同一错误。 */
const verifyEmail = defineAction({
	input: z.object({ token: z.string().min(1, '验证令牌不能为空') }),
	handler: async ({ token }) => {
		if (!(await consumeEmailVerificationToken(token))) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '验证链接无效或已失效' });
		}
		return { verified: true };
	}
});

/** 始终接受重发请求，避免通过 Action 响应枚举邮箱和账号状态。 */
const resendVerification = defineAction({
	input: z.object({ email: z.string().min(1, '邮箱不能为空') }),
	handler: async ({ email }) => {
		await resendEmailVerification(email);
		return { accepted: true, message: '若邮箱可用，验证邮件已发送' };
	}
});

/**
 * 用户登出 Action
 */
const logout = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		clearTokenCookie(context);
		return { message: '已登出' };
	}
});

export { login, register, verifyEmail, resendVerification, logout };
