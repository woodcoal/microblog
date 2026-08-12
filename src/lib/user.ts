/**
 * 用户数据库操作模块
 *
 * 提供用户的 CRUD 原子操作，供 Service 层调用。
 * 所有函数直接操作 Prisma Client，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/**
 * 按 ID 查询用户
 *
 * @param id - 用户 ID
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserById<T extends Prisma.UserSelect>(id: string, select?: T) {
	return prisma.user.findUnique({
		where: { id },
		...(select ? { select } : {})
	});
}

/**
 * 按邮箱查询用户
 *
 * @param email - 用户邮箱
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserByEmail(email: string) {
	return prisma.user.findUnique({ where: { email } });
}

/**
 * 按用户名查询用户
 *
 * @param username - 用户名
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserByUsername<T extends Prisma.UserSelect>(
	username: string,
	select?: T
) {
	return prisma.user.findUnique({
		where: { username, deletedAt: null, isDisabled: false },
		...(select ? { select } : {})
	});
}

/** 当前用户名优先；历史用户名仅用于 URL/API 的兼容重定向，绝不用于新提及。 */
export async function resolveUsername(username: string) {
	const normalizedUsername = username.trim().toLowerCase();
	const current = await prisma.user.findUnique({
		where: { username: normalizedUsername },
		select: { id: true, username: true }
	});
	if (current) return { ...current, isLegacy: false };
	const claim = await prisma.usernameClaim.findUnique({
		where: { username: normalizedUsername },
		select: { user: { select: { id: true, username: true } } }
	});
	return claim ? { ...claim.user, isLegacy: true } : null;
}

/** 创建用户并在同一事务中占用用户名，避免并发注册留下无 claim 的用户。 */
export async function createUserWithUsernameClaim(data: Prisma.UserCreateInput) {
	return prisma.$transaction(async (tx) => {
		const user = await tx.user.create({ data });
		await tx.usernameClaim.create({ data: { username: user.username, userId: user.id } });
		return user;
	});
}

/** 用户主页详情所需的公开字段与统计信息。 */
export function findUserDetailByUsername(username: string) {
	return prisma.user.findFirst({
		where: { username, deletedAt: null, isDisabled: false },
		select: {
			id: true,
			username: true,
			displayName: true,
			bio: true,
			avatarUrl: true,
			createdAt: true,
			isDisabled: true,
			deletedAt: true,
			emailVerifiedAt: true,
			_count: {
				select: { posts: { where: { isDeleted: false } }, following: true, followers: true }
			}
		}
	});
}

/**
 * 创建用户
 *
 * @param data - 用户创建数据（Prisma UserCreateInput）
 * @returns 新创建的用户记录
 */
export async function createUser(data: Prisma.UserCreateInput) {
	return prisma.user.create({ data });
}

/**
 * 更新用户
 *
 * @param id - 用户 ID
 * @param data - 更新数据（Prisma UserUpdateInput）
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 更新后的用户记录
 */
export async function updateUser<T extends Prisma.UserSelect>(
	id: string,
	data: Prisma.UserUpdateInput,
	select?: T
) {
	return prisma.user.update({
		where: { id },
		data,
		...(select ? { select } : {})
	});
}

/**
 * 批量禁用用户
 *
 * 排除 admin 角色用户，防止误操作。
 *
 * @param ids - 用户 ID 数组
 * @returns 受影响的用户数量
 */
export async function batchDisableUsers(ids: string[]) {
	return prisma.user.updateMany({
		where: {
			id: { in: ids },
			role: { not: 'admin' }
		},
		data: { isDisabled: true }
	});
}

/**
 * 批量启用用户
 *
 * @param ids - 用户 ID 数组
 * @returns 受影响的用户数量
 */
export async function batchEnableUsers(ids: string[]) {
	return prisma.user.updateMany({
		where: { id: { in: ids } },
		data: { isDisabled: false }
	});
}

/**
 * 按用户名列表搜索用户
 *
 * 精确匹配用户名，排除被禁用的用户。
 *
 * @param usernames - 用户名数组
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的用户列表
 */
export async function searchUsersByUsernames<T extends Prisma.UserSelect>(
	usernames: string[],
	select?: T
) {
	return prisma.user.findMany({
		where: {
			username: { in: usernames },
			isDisabled: false,
			deletedAt: null,
			emailVerifiedAt: { not: null }
		},
		...(select ? { select } : {})
	});
}

/**
 * 搜索用户（模糊匹配）
 *
 * 按用户名和显示名模糊匹配，排除被禁用的用户。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的用户列表
 */
export async function searchUsers<T extends Prisma.UserSelect>(
	query: string,
	take: number,
	select?: T
) {
	return prisma.user.findMany({
		where: {
			isDisabled: false,
			deletedAt: null,
			OR: [{ username: { contains: query } }, { displayName: { contains: query } }]
		},
		orderBy: { followers: { _count: 'desc' } },
		take,
		...(select ? { select } : {})
	});
}

/** 查询提及的有效用户 ID，排除当前用户。 */
export function findMentionedUserIds(usernames: string[], currentUserId: string) {
	return prisma.user.findMany({
		where: { username: { in: usernames }, id: { not: currentUserId }, deletedAt: null },
		select: { id: true }
	});
}

/** Agent 用户列表查询。 */
export function findAgentUsers(input: {
	keyword?: string;
	userScope?: string;
	skip?: number;
	limit?: number;
	followingIds?: string[];
	followerIds?: string[];
	currentUserId?: string;
	sort?: string;
}) {
	const where: Prisma.UserWhereInput = {
		isDisabled: false,
		deletedAt: null,
		emailVerifiedAt: { not: null }
	};
	if (input.keyword) {
		where.OR = [
			{ username: { contains: input.keyword } },
			{ displayName: { contains: input.keyword } }
		];
	}
	if (input.userScope === 'following' && input.followingIds) {
		where.id = {
			in: [...input.followingIds, input.currentUserId].filter(
				(id): id is string => typeof id === 'string'
			)
		};
	} else if (input.userScope === 'followers' && input.followerIds) {
		where.id = {
			in: [...input.followerIds, input.currentUserId].filter(
				(id): id is string => typeof id === 'string'
			)
		};
	}

	return prisma.user.findMany({
		where,
		orderBy: input.sort === 'earliest' ? { createdAt: 'asc' } : { createdAt: 'desc' },
		skip: input.skip,
		take: input.limit,
		select: { id: true, username: true, displayName: true }
	});
}

/** v1 API 用户查询，隐去敏感字段并携带计数与当前访问者关注状态。 */
export function findApiUser(username: string, viewerId?: string) {
	const viewerFilter = viewerId ? { followerId: viewerId } : { followerId: '' };
	return prisma.user.findFirst({
		where: { username, isDisabled: false, deletedAt: null, emailVerifiedAt: { not: null } },
		select: apiUserSelect(viewerFilter)
	});
}

export function findApiUsers(query: string, skip: number, take: number, viewerId?: string) {
	const viewerFilter = viewerId ? { followerId: viewerId } : { followerId: '' };
	return prisma.user.findMany({
		where: {
			isDisabled: false,
			deletedAt: null,
			emailVerifiedAt: { not: null },
			OR: [{ username: { contains: query } }, { displayName: { contains: query } }]
		},
		skip,
		take,
		orderBy: { followers: { _count: 'desc' } },
		select: apiUserSelect(viewerFilter)
	});
}

export function countApiUsers(query: string) {
	return prisma.user.count({
		where: {
			isDisabled: false,
			deletedAt: null,
			emailVerifiedAt: { not: null },
			OR: [{ username: { contains: query } }, { displayName: { contains: query } }]
		}
	});
}

function apiUserSelect(viewerFilter: Prisma.FollowWhereInput) {
	return {
		id: true,
		username: true,
		displayName: true,
		avatarUrl: true,
		bio: true,
		createdAt: true,
		_count: {
			select: { posts: { where: { isDeleted: false } }, followers: true, following: true }
		},
		followers: { where: viewerFilter, select: { id: true } }
	};
}
