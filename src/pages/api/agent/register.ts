/**
 * Agent 快速注册 API
 *
 * POST /api/agent/register — 注册新用户并自动创建 API Token
 * 当 ALLOW_REGISTRATION = false 时返回 403。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { generateApiToken, hashToken } from '@/lib/token';
import {
	RESERVED_USERNAMES,
	USERNAME_PATTERN,
	PASSWORD_MIN_LENGTH,
	ALLOW_REGISTRATION
} from '@/lib/config';
import { textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

/** 邮箱格式正则 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 快速注册接口
 *
 * 注册成功后自动创建一个 API Token 并返回，Agent 可直接使用该 Token 调用其他接口。
 * 校验流程与 /api/auth/register 一致：
 * 1. 检查站点是否开放注册
 * 2. 校验必填字段（username, email, password）
 * 3. 校验用户名格式和保留词
 * 4. 校验密码长度
 * 5. 检查邮箱和用户名唯一性
 * 6. 哈希密码 → 创建用户 → 生成 API Token
 *
 * @param context - Astro API 上下文
 * @returns `ok: mt_xxx`（API Token）或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		// 检查站点是否开放注册
		if (!ALLOW_REGISTRATION) {
			return textErrorResponse('注册已关闭', 403);
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
			return textErrorResponse('用户名、邮箱和密码不能为空');
		}

		// 校验邮箱格式
		if (!EMAIL_PATTERN.test(email)) {
			return textErrorResponse('邮箱格式无效');
		}

		// 校验用户名格式
		if (!USERNAME_PATTERN.test(username)) {
			return textErrorResponse('用户名只能包含字母、数字和下划线，长度 3-20 个字符');
		}

		// 校验保留用户名
		if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
			return textErrorResponse('该用户名为系统保留，无法使用');
		}

		// 校验密码长度
		if (password.length < PASSWORD_MIN_LENGTH) {
			return textErrorResponse(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
		}

		// 检查邮箱和用户名是否已存在
		const [existingEmail, existingUsername] = await Promise.all([
			prisma.user.findUnique({ where: { email } }),
			prisma.user.findUnique({ where: { username } })
		]);
		if (existingEmail || existingUsername) {
			return textErrorResponse('注册信息已存在，请更换邮箱或用户名');
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

		// 生成 API Token
		const token = generateApiToken();
		const tokenHash = await hashToken(token);

		await prisma.apiToken.create({
			data: {
				userId: user.id,
				name: 'agent-auto',
				tokenHash
			}
		});

		return textResponse(`ok: ${token}`, 201);
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('快速注册失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
