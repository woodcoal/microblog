/**
 * API 令牌 Actions
 *
 * 提供 API 令牌的创建和撤销功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateApiToken, hashToken } from '@/lib/token';

/** 每个用户最多创建的 Token 数量 */
const MAX_TOKENS_PER_USER = 10;

/**
 * 创建 API Token Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 校验 name 参数（必填，1-50 字符）
 * 3. 检查用户 Token 数量上限
 * 4. 生成 Token 明文 → 计算 SHA-256 哈希
 * 5. 存储 tokenHash 到数据库
 * 6. 返回 Token 元信息 + 明文（仅此一次返回）
 *
 * @param input - { name: Token 名称 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的 Token 数据（含明文 token，仅此一次）
 */
export const createToken = defineAction({
	input: z.object({
		name: z.string().min(1, 'Token 名称不能为空').max(50, 'Token 名称不能超过 50 个字符')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { name } = input;

		// 3. 检查用户 Token 数量上限
		const tokenCount = await prisma.apiToken.count({
			where: { userId: currentUser.userId }
		});
		if (tokenCount >= MAX_TOKENS_PER_USER) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `每个用户最多创建 ${MAX_TOKENS_PER_USER} 个 Token`
			});
		}

		// 4. 生成 Token 明文并计算哈希
		const token = generateApiToken();
		const tokenHash = await hashToken(token);

		// 5. 存储到数据库
		const apiToken = await prisma.apiToken.create({
			data: {
				userId: currentUser.userId,
				name: name.trim(),
				tokenHash
			}
		});

		// 6. 返回 Token 元信息 + 明文（仅此一次返回）
		return {
			id: apiToken.id,
			name: apiToken.name,
			token,
			createdAt: apiToken.createdAt.toISOString()
		};
	}
});

/**
 * 撤销 API Token Action
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 查询 Token 是否存在并验证所属用户
 * 3. 删除 Token 记录
 *
 * @param input - { id: Token ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 被撤销的 Token ID
 */
export const revokeToken = defineAction({
	input: z.object({
		id: z.string().min(1, 'Token ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { id } = input;

		// 2. 查询 Token 是否存在
		const apiToken = await prisma.apiToken.findUnique({ where: { id } });
		if (!apiToken) {
			throw new ActionError({ code: 'NOT_FOUND', message: 'Token 不存在' });
		}

		// 验证是 Token 所属用户
		if (apiToken.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权撤销此 Token' });
		}

		// 3. 删除 Token 记录
		await prisma.apiToken.delete({ where: { id } });

		return { id };
	}
});
