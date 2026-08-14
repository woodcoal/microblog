/**
 * API Token 工具模块
 *
 * 提供 API Token 的生成、哈希、验证和数据库 CRUD 功能。
 * 使用 Web Crypto API（兼容 Cloudflare Workers），
 * 不依赖 Node.js 内置 crypto 模块。
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/** Token 前缀，用于识别 MuTan 平台的 API Token */
const TOKEN_PREFIX = 'mt_';

/** Token 随机部分的字节长度（32 字节 = 64 十六进制字符，取前 32 字符） */
const TOKEN_RANDOM_BYTES = 32;

/**
 * 生成 API Token 明文
 *
 * 格式: `mt_` + 32 位随机字符串。
 * 使用 crypto.getRandomValues 生成密码学安全的随机值。
 *
 * @returns Token 明文字符串，格式如 `mt_a1b2c3d4e5f6...`
 */
export function generateApiToken(): string {
	const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
	crypto.getRandomValues(bytes);
	// 将随机字节转为十六进制字符串，取前 32 个字符
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return TOKEN_PREFIX + hex.slice(0, 32);
}

/**
 * 计算 Token 的 SHA-256 哈希
 *
 * 使用 Web Crypto API 的 subtle.digest 方法，
 * 兼容 Cloudflare Workers 运行时。
 *
 * @param token - Token 明文字符串
 * @returns 十六进制格式的 SHA-256 哈希字符串
 */
export async function hashToken(token: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	// 将 ArrayBuffer 转为十六进制字符串
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── 数据库 CRUD 操作 ──

/**
 * 统计用户的 API Token 数量
 *
 * @param userId - 用户 ID
 * @returns 该用户的 Token 数量
 */
export async function countApiTokens(userId: string): Promise<number> {
	return prisma.apiToken.count({ where: { userId } });
}

/**
 * 创建 API Token 数据库记录
 *
 * @param data - Token 创建数据（userId, name, tokenHash）
 * @returns 创建的 ApiToken 记录
 */
export async function createApiToken(data: {
	userId: string;
	name: string;
	tokenHash: string;
	purpose?: string;
}) {
	return prisma.apiToken.create({ data });
}

const AGENT_ACCESS_PURPOSE = 'agent_access';

/**
 * Agent Token 的唯一内部构造函数。生成明文、计算摘要和持久化保持在同一处，
 * 供注册事务和登录轮换共享，避免两条路径产生不同格式或遗漏摘要存储。
 */
export async function createAgentAccessTokenInTransaction(
	tx: Prisma.TransactionClient,
	userId: string
): Promise<{ token: string }> {
	const token = generateApiToken();
	const tokenHash = await hashToken(token);
	await tx.apiToken.create({
		data: { userId, name: 'Agent access', tokenHash, purpose: AGENT_ACCESS_PURPOSE }
	});
	return { token };
}

/** 原子轮换该用户唯一的 Agent Token；手工 Token（purpose 为 null）不会受影响。 */
export async function rotateAgentAccessToken(userId: string): Promise<{ token: string }> {
	return prisma.$transaction(async (tx) => {
		await tx.apiToken.deleteMany({ where: { userId, purpose: AGENT_ACCESS_PURPOSE } });
		return createAgentAccessTokenInTransaction(tx, userId);
	});
}

/**
 * 根据 ID 查询 API Token
 *
 * @param id - Token ID
 * @returns Token 记录，不存在返回 null
 */
export async function findApiTokenById(id: string) {
	return prisma.apiToken.findUnique({ where: { id } });
}

/**
 * 删除 API Token
 *
 * @param id - Token ID
 * @returns 被删除的 Token 记录
 */
export async function deleteApiToken(id: string) {
	return prisma.apiToken.delete({ where: { id } });
}
