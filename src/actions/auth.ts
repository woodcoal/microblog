/**
 * 认证 Actions
 *
 * 提供用户登录、注册、登出的服务端 Actions。
 * 替代传统 REST API 路由，使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import {
	verifyPassword,
	hashPassword,
	generateToken,
	setTokenCookie,
	clearTokenCookie
} from '@/lib/auth';
import {
	ALLOW_REGISTRATION,
	USERNAME_PATTERN,
	PASSWORD_MIN_LENGTH,
	RESERVED_USERNAMES,
	DISABLED_USER_MESSAGE
} from '@/lib/config';

/** 邮箱格式正则 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 用户登录 Action
 *
 * 校验邮箱密码，验证通过后生成 JWT 并设置 HttpOnly cookie。
 * 使用 dummyHash 防止时序攻击枚举有效邮箱。
 * 被禁用的用户无法登录。
 *
 * @param input - { email: 邮箱, password: 密码 }
 * @param context - Astro APIContext，用于设置 cookie
 * @returns { token, user: { id, username, displayName, avatarUrl, role } }
 */
const login = defineAction({
	input: z.object({
		email: z.string().min(1, '邮箱不能为空'),
		password: z.string().min(1, '密码不能为空')
	}),
	handler: async (input, context) => {
		const { email, password } = input;

		// 查找用户
		const user = await prisma.user.findUnique({ where: { email } });

		// 无论用户是否存在都执行 bcrypt 比较，防止时序攻击枚举有效邮箱
		const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
		const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);

		if (!user || !valid) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '邮箱或密码错误' });
		}

		// 检查用户是否被禁用
		if (user.isDisabled) {
			throw new ActionError({ code: 'FORBIDDEN', message: DISABLED_USER_MESSAGE });
		}

		// 生成 JWT
		const token = await generateToken({
			userId: user.id,
			username: user.username,
			role: user.role
		});

		// 设置 HttpOnly cookie
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
	}
});

/**
 * 用户注册 Action
 *
 * 校验用户名、邮箱、密码，创建用户并返回 JWT。
 * 当 ALLOW_REGISTRATION = false 时拒绝注册。
 *
 * @param input - { username: 用户名, displayName?: 显示名, email: 邮箱, password: 密码 }
 * @param context - Astro APIContext，用于设置 cookie
 * @returns { token, user: { id, username, displayName, avatarUrl, role } }
 */
const register = defineAction({
	input: z.object({
		username: z.string().min(1, '用户名不能为空'),
		displayName: z.string().optional(),
		email: z.string().min(1, '邮箱不能为空'),
		password: z.string().min(1, '密码不能为空')
	}),
	handler: async (input, context) => {
		const { username, displayName, email, password } = input;

		// 检查站点是否开放注册
		if (!ALLOW_REGISTRATION) {
			throw new ActionError({ code: 'FORBIDDEN', message: '注册已关闭' });
		}

		// 校验邮箱格式
		if (!EMAIL_PATTERN.test(email)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '邮箱格式无效' });
		}

		// 校验用户名格式
		if (!USERNAME_PATTERN.test(username)) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: '用户名只能包含字母、数字和下划线，长度 3-20 个字符'
			});
		}

		// 校验保留用户名
		if (
			RESERVED_USERNAMES.includes(
				username.toLowerCase() as (typeof RESERVED_USERNAMES)[number]
			)
		) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '该用户名为系统保留，无法使用' });
		}

		// 校验密码长度
		if (password.length < PASSWORD_MIN_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`
			});
		}

		// 检查邮箱和用户名是否已存在（合并提示，防止枚举攻击）
		const [existingEmail, existingUsername] = await Promise.all([
			prisma.user.findUnique({ where: { email } }),
			prisma.user.findUnique({ where: { username } })
		]);
		if (existingEmail || existingUsername) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: '注册信息已存在，请更换邮箱或用户名'
			});
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
	}
});

/**
 * 用户登出 Action
 *
 * 清除服务端 HttpOnly cookie 中的 token。
 * 前端也应同时清除 localStorage 中的 token。
 *
 * @param input - 无
 * @param context - Astro APIContext，用于清除 cookie
 * @returns { message: '已登出' }
 */
const logout = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		clearTokenCookie(context);
		return { message: '已登出' };
	}
});

export { login, register, logout };
