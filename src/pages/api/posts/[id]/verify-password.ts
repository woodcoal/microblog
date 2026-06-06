/**
 * 密码验证 API
 *
 * POST /api/posts/:id/verify-password — 验证密码保护帖子的访问密码
 * 接收 { password: string }，返回 { valid: boolean }
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/**
 * 验证密码保护帖子的访问密码
 *
 * 流程：
 * 1. 获取帖子 ID 和密码
 * 2. 查询帖子，检查是否是密码保护类型
 * 3. 验证密码是否正确
 * 4. 返回验证结果
 *
 * @param context - Astro API 上下文
 * @returns 验证结果 { valid: boolean }
 */
export const POST: APIRoute = async (context) => {
	try {
		const { id } = context.params;

		if (!id) {
			return jsonErrorResponse('帖子 ID 不能为空');
		}

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { password } = body as { password?: string };

		if (!password) {
			return jsonErrorResponse('请输入密码');
		}

		// 查询帖子
		const post = await prisma.post.findUnique({
			where: { id },
			select: {
				visibility: true,
				passwordHash: true,
				isDeleted: true
			}
		});

		// 帖子不存在
		if (!post) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 已删除的帖子
		if (post.isDeleted) {
			return jsonErrorResponse('帖子不存在', 404);
		}

		// 非密码保护帖子
		if (post.visibility !== 'password') {
			return jsonErrorResponse('该帖子不需要密码验证');
		}

		// 没有密码哈希（数据异常）
		if (!post.passwordHash) {
			return jsonErrorResponse('帖子密码配置异常', 500);
		}

		// 验证密码
		const valid = await verifyPassword(password, post.passwordHash);

		return new Response(JSON.stringify(successResponse({ valid })), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('密码验证失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
