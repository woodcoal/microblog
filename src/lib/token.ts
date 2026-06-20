/**
 * API Token 工具模块
 *
 * 提供 API Token 的生成、哈希、验证和数据库 CRUD 功能。
 * 使用 Web Crypto API（兼容 Cloudflare Workers），
 * 不依赖 Node.js 内置 crypto 模块。
 */

import { prisma } from '@/lib/db';

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

/**
 * 验证 Token 是否匹配
 *
 * 计算传入 token 的 SHA-256 哈希，与存储的 tokenHash 进行比较。
 * 使用时间安全的字符串比较（逐字符比较，避免提前返回），
 * 防止时序攻击。
 *
 * @param tokenHash - 数据库中存储的 Token 哈希
 * @param token - 待验证的 Token 明文
 * @returns 是否匹配
 */
async function verifyApiToken(tokenHash: string, token: string): Promise<boolean> {
	const computedHash = await hashToken(token);

	// 时间安全的字符串比较：逐字符比较，不提前返回
	if (tokenHash.length !== computedHash.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < tokenHash.length; i++) {
		result |= tokenHash.charCodeAt(i) ^ computedHash.charCodeAt(i);
	}
	return result === 0;
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
export async function createApiToken(data: { userId: string; name: string; tokenHash: string }) {
	return prisma.apiToken.create({ data });
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
