/**
 * Agent 登录 API
 *
 * POST /api/agent/login — 邮箱密码登录，返回 API Token（如存在）
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { DISABLED_USER_MESSAGE } from '@/lib/config';
import { textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

/**
 * Agent 登录接口
 *
 * 校验邮箱密码后，查询用户是否已有 API Token：
 * - 有 Token：返回 `ok: mt_xxx`（最近创建的一个）
 * - 无 Token：返回 `error: 该用户无可用 Token，请先在设置中创建 API Token`
 *
 * 安全：无论用户是否存在都执行 bcrypt 比较，防止时序攻击枚举邮箱。
 *
 * @param context - Astro API 上下文
 * @returns API Token 或错误提示
 */
export const POST: APIRoute = async (context) => {
	try {
		const body = await parseJsonBody(context.request);
		const { email, password } = body as { email?: string; password?: string };

		// 校验必填字段
		if (!email || !password) {
			return textErrorResponse('邮箱和密码不能为空');
		}

		// 查找用户
		const user = await prisma.user.findUnique({ where: { email } });

		// 无论用户是否存在都执行 bcrypt 比较，防止时序攻击枚举有效邮箱
		const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
		const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);

		if (!user || !valid) {
			return textErrorResponse('邮箱或密码错误', 401);
		}

		// 检查用户是否被禁用
		if (user.isDisabled) {
			return textErrorResponse(DISABLED_USER_MESSAGE, 403);
		}

		// 查询用户的 API Token（取最近创建的一个，但不返回明文——需特殊处理）
		// 由于 tokenHash 是哈希存储，无法还原明文，
		// 所以只能告知用户是否有可用 Token，让用户自行获取。
		// 但 Agent 场景下需要直接返回可用 Token，
		// 因此改为：查找是否存在 Token 记录，存在则提示用户已在其他设备创建过
		const tokenCount = await prisma.apiToken.count({
			where: { userId: user.id }
		});

		if (tokenCount === 0) {
			return textErrorResponse('该用户无可用 Token，请先通过 /api/agent/register 注册或前往设置创建 API Token', 404);
		}

		// 有 Token 但无法返回明文（哈希存储），提示用户
		return textResponse(`ok: 该用户已有 ${tokenCount} 个 API Token，但 Token 明文仅在创建时返回一次。请使用已保存的 Token，或通过 /api/tokens 创建新 Token`);
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('Agent 登录失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
