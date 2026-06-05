/**
 * Agent 用户详情 API
 *
 * GET /api/agent/users/:username — 获取用户详情
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse, formatUserDetail } from '@/lib/agent';

/**
 * 获取用户详情
 *
 * 返回用户的 username、displayName、bio、avatarUrl、微博/关注/粉丝数、注册时间。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的用户详情
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		const { username } = context.params;
		if (!username) {
			return textErrorResponse('用户名不能为空');
		}

		// 查询用户
		const user = await prisma.user.findUnique({
			where: { username },
			select: {
				id: true,
				username: true,
				displayName: true,
				bio: true,
				avatarUrl: true,
				createdAt: true,
				isDisabled: true,
				_count: {
					select: {
						posts: { where: { isDeleted: false } },
						following: true,
						followers: true
					}
				}
			}
		});

		if (!user) {
			return textErrorResponse('用户不存在', 404);
		}

		if (user.isDisabled) {
			return textErrorResponse('该用户已被禁用', 404);
		}

		return textResponse(formatUserDetail(user));
	} catch (error) {
		console.error('获取用户详情失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
