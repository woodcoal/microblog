/**
 * 用户 Service
 *
 * 编排用户查询的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findAgentUsers, findUserDetailByUsername } from '@/lib/user';

// ── Agent API 专用查询函数 ──

/**
 * Agent 用户列表查询
 *
 * 支持关键词搜索、关注范围过滤和分页排序。
 * 供 Agent API 层获取用户列表。
 *
 * @param input - 查询参数
 * @returns 用户列表
 */
export async function getUserList(input: {
	keyword?: string;
	userScope?: string;
	sort?: string;
	skip?: number;
	limit?: number;
	followingIds?: string[];
	followerIds?: string[];
	currentUserId?: string;
}): Promise<Array<{ id: string; username: string; displayName: string }>> {
	const { keyword, userScope, sort, skip, limit, followingIds, followerIds, currentUserId } =
		input;

	return findAgentUsers({
		keyword,
		userScope,
		sort,
		skip,
		limit,
		followingIds,
		followerIds,
		currentUserId
	});
}

/**
 * Agent 用户详情查询
 *
 * 查询用户的详细信息，含帖子数、关注数、粉丝数。
 * 供 Agent API 层获取用户详情。
 *
 * @param input - { username }
 * @returns 用户详情；用户不存在时返回 null
 */
export async function getUserDetail(input: { username: string }) {
	const { username } = input;
	return findUserDetailByUsername(username);
}
