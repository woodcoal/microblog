/**
 * API 令牌 Service
 *
 * 编排 API 令牌的创建和撤销业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { ServiceError } from '@/lib/errors';
import {
	generateApiToken,
	hashToken,
	countApiTokens,
	createApiToken,
	findApiTokenById,
	deleteApiToken
} from '@/lib/token';

/** 每个用户最多创建的 Token 数量 */
const MAX_TOKENS_PER_USER = 10;

// ── 类型定义 ──

export interface CreateTokenInput {
	userId: string;
	name: string;
}

export interface CreateTokenResult {
	id: string;
	name: string;
	token: string;
	createdAt: string;
}

export interface RevokeTokenInput {
	userId: string;
	id: string;
}

// ── 业务函数 ──

/**
 * 创建 API Token
 *
 * 校验用户 Token 数量上限，生成 Token 明文 → 计算 SHA-256 哈希，
 * 存储 tokenHash 到数据库。
 * 返回 Token 元信息 + 明文（仅此一次返回）。
 *
 * @param input - { userId, name }
 * @returns 创建的 Token 数据（含明文 token，仅此一次）
 */
export async function createToken(input: CreateTokenInput): Promise<CreateTokenResult> {
	const { userId, name } = input;

	// 检查用户 Token 数量上限
	const tokenCount = await countApiTokens(userId);
	if (tokenCount >= MAX_TOKENS_PER_USER) {
		throw new ServiceError('BAD_REQUEST', `每个用户最多创建 ${MAX_TOKENS_PER_USER} 个 Token`);
	}

	// 生成 Token 明文并计算哈希
	const token = generateApiToken();
	const tokenHash = await hashToken(token);

	// 存储到数据库
	const apiToken = await createApiToken({
		userId,
		name: name.trim(),
		tokenHash
	});

	// 返回 Token 元信息 + 明文（仅此一次返回）
	return {
		id: apiToken.id,
		name: apiToken.name,
		token,
		createdAt: apiToken.createdAt.toISOString()
	};
}

/**
 * 撤销 API Token
 *
 * 校验 Token 存在且属于当前用户，删除 Token 记录。
 *
 * @param input - { userId, id }
 * @returns 被撤销的 Token ID
 */
export async function revokeToken(input: RevokeTokenInput): Promise<{ id: string }> {
	const { userId, id } = input;

	// 查询 Token 是否存在
	const apiToken = await findApiTokenById(id);
	if (!apiToken) {
		throw new ServiceError('NOT_FOUND', 'Token 不存在');
	}

	// 验证是 Token 所属用户
	if (apiToken.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权撤销此 Token');
	}

	// 删除 Token 记录
	await deleteApiToken(id);

	return { id };
}
