/**
 * Agent 用户列表 API
 *
 * GET /api/agent/users — 用户列表（多过滤、分页）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import {
	requireAgentAuth,
	textResponse,
	textErrorResponse,
	parsePagination,
	getFollowIds,
	formatUserListItem
} from '@/lib/agent';

/**
 * 获取用户列表
 *
 * 参数：keyword, userScope(all/followers/following), sort(latest/earliest), page, limit
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的用户列表
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const url = new URL(context.request.url);
		const keyword = url.searchParams.get('keyword')?.trim() || undefined;
		const userScope = url.searchParams.get('userScope') || 'all';
		const sort = url.searchParams.get('sort') || 'latest';
		const { limit, skip } = parsePagination(url);

		// 构建 where 条件
		const where: Record<string, unknown> = {
			isDisabled: false
		};

		// keyword 过滤
		if (keyword) {
			where.OR = [
				{ username: { contains: keyword } },
				{ displayName: { contains: keyword } }
			];
		}

		// userScope 过滤
		if (userScope === 'following' || userScope === 'followers') {
			const { followingIds, followerIds } = await getFollowIds(currentUser.userId);
			if (userScope === 'following') {
				// 当前用户关注的人（含自己）
				where.id = { in: [...followingIds, currentUser.userId] };
			} else {
				// 关注当前用户的粉丝（含自己）
				where.id = { in: [...followerIds, currentUser.userId] };
			}
		}

		// 排序
		const orderBy =
			sort === 'earliest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

		// 查询
		const users = await prisma.user.findMany({
			where,
			orderBy,
			skip,
			take: limit,
			select: {
				id: true,
				username: true,
				displayName: true
			}
		});

		// 格式化输出
		const lines = users.map((u) => formatUserListItem(u));
		return textResponse(lines.join('\n'));
	} catch (error) {
		console.error('获取用户列表失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
