/**
 * Agent 用户列表 API
 *
 * GET /api/agent/users — 用户列表（多过滤、分页）
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import {
	requireAgentAuth,
	textResponse,
	textErrorResponse,
	parsePagination,
	getFollowIds,
	formatUserListItem
} from '@/lib/agent';
import { getAgentUserList } from '@/services/user.service';

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

		// userScope 过滤需要获取关注 ID 列表
		let followingIds: string[] | undefined;
		let followerIds: string[] | undefined;
		if (userScope === 'following' || userScope === 'followers') {
			const ids = await getFollowIds(currentUser.userId);
			followingIds = ids.followingIds;
			followerIds = ids.followerIds;
		}

		// 通过 service 查询用户列表
		const users = await getAgentUserList({
			keyword,
			userScope,
			sort,
			skip,
			limit,
			followingIds,
			followerIds,
			currentUserId: currentUser.userId
		});

		// 格式化输出
		const lines = users.map((u) => formatUserListItem(u));
		return textResponse(lines.join('\n'));
	} catch (error) {
		console.error('获取用户列表失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
