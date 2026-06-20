/**
 * 用户 Service
 *
 * 编排用户查询的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findUserByUsername } from '@/lib/user';
import { prisma } from '@/lib/db';

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
export async function getAgentUserList(input: {
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

	// 构建 where 条件
	const where: Record<string, unknown> = {
		isDisabled: false
	};

	// keyword 过滤
	if (keyword) {
		where.OR = [{ username: { contains: keyword } }, { displayName: { contains: keyword } }];
	}

	// userScope 过滤
	if (userScope === 'following' && followingIds) {
		where.id = { in: [...followingIds, currentUserId] };
	} else if (userScope === 'followers' && followerIds) {
		where.id = { in: [...followerIds, currentUserId] };
	}

	// 排序
	const orderBy =
		sort === 'earliest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

	// 查询
	return prisma.user.findMany({
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
export async function getAgentUserDetail(input: { username: string }): Promise<any | null> {
	const { username } = input;
	return findUserByUsername(username, {
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
	});
}
