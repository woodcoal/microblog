/**
 * Token 列表和创建 API
 *
 * GET  /api/tokens — 获取当前用户的 Token 列表
 * POST /api/tokens — 创建新 Token
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, parseJsonBody, jsonErrorResponse } from '@/lib/utils';
import { generateApiToken, hashToken } from '@/lib/token';

/** 每个用户最多创建的 Token 数量 */
const MAX_TOKENS_PER_USER = 10;

/**
 * 获取当前用户的 Token 列表
 *
 * 返回当前用户所有 Token 的元信息，
 * 不返回 tokenHash（安全考虑），仅返回 id、name、lastUsedAt、createdAt。
 *
 * @param context - Astro API 上下文
 * @returns Token 列表
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 查询当前用户的所有 Token，仅返回安全字段
		const tokens = await prisma.apiToken.findMany({
			where: { userId: currentUser.userId },
			select: {
				id: true,
				name: true,
				lastUsedAt: true,
				createdAt: true
			},
			orderBy: { createdAt: 'desc' }
		});

		return new Response(JSON.stringify(successResponse({ tokens })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('获取 Token 列表失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 创建新 Token
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 校验 name 参数（必填，1-50 字符）
 * 3. 检查用户 Token 数量上限
 * 4. 生成 Token 明文 → 计算 SHA-256 哈希
 * 5. 存储 tokenHash 到数据库
 * 6. 返回 Token 元信息 + 明文（仅此一次返回）
 *
 * @param context - Astro API 上下文
 * @returns 创建的 Token 数据（含明文 token，仅此一次）
 */
export const POST: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { name } = body as { name?: string };

		// 2. 校验 name 参数
		if (!name || !name.trim()) {
			return jsonErrorResponse('Token 名称不能为空');
		}

		if (name.trim().length > 50) {
			return jsonErrorResponse('Token 名称不能超过 50 个字符');
		}

		// 3. 检查用户 Token 数量上限
		const tokenCount = await prisma.apiToken.count({
			where: { userId: currentUser.userId }
		});
		if (tokenCount >= MAX_TOKENS_PER_USER) {
			return jsonErrorResponse(`每个用户最多创建 ${MAX_TOKENS_PER_USER} 个 Token`);
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
		return new Response(
			JSON.stringify(
				successResponse({
					id: apiToken.id,
					name: apiToken.name,
					token,
					createdAt: apiToken.createdAt
				})
			),
			{ status: 201, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('创建 Token 失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
