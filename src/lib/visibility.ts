/**
 * 可见度控制工具函数
 *
 * 提供 7 种可见度的检查和过滤功能：
 * public / logged_in / followers / following / private / password / users
 *
 * checkPostVisibility — 单条帖子的可见度判断
 * getVisibilityFilter  — 生成 Prisma where 条件，用于列表查询
 */
import { verifyPassword } from '@/lib/auth';
import { Prisma } from '../../generated/prisma/client';

/** 合法的可见度值 */
export const VALID_VISIBILITIES = [
	'public',
	'logged_in',
	'followers',
	'following',
	'private',
	'password',
	'users'
] as const;

/** 可见度类型 */
export type Visibility = (typeof VALID_VISIBILITIES)[number];

/** 帖子可见度检查所需字段 */
interface PostVisibilityData {
	/** 可见度类型 */
	visibility: string;
	/** 帖子作者 ID */
	userId: string;
	/** 密码哈希（visibility=password 时使用） */
	passwordHash?: string | null;
	/** 允许查看的用户 ID JSON 数组（visibility=users 时使用） */
	allowedUserIds?: string | null;
}

/** 当前用户信息 */
interface CurrentUser {
	/** 用户 ID */
	userId: string;
}

/** checkPostVisibility 的可选参数 */
interface CheckOptions {
	/** 输入的密码（visibility=password 时使用） */
	password?: string;
	/** 当前用户是否是帖子作者的粉丝 */
	isFollower?: boolean;
	/** 当前用户是否被帖子作者关注 */
	isFollowing?: boolean;
}

/**
 * 检查单条帖子对当前用户是否可见
 *
 * 根据帖子可见度类型和当前用户身份，判断是否有权查看。
 * 各可见度规则：
 * - public：所有人可见
 * - logged_in：已登录用户可见
 * - followers：作者粉丝或作者本人可见
 * - following：作者关注的人或作者本人可见
 * - private：仅作者本人可见
 * - password：输入正确密码后可见
 * - users：allowedUserIds 列表中的用户或作者本人可见
 *
 * @param post - 帖子可见度相关数据
 * @param currentUser - 当前登录用户，null 表示未登录
 * @param options - 额外选项（密码、粉丝/关注状态）
 * @returns 是否可见
 */
export async function checkPostVisibility(
	post: PostVisibilityData,
	currentUser: CurrentUser | null,
	options?: CheckOptions
): Promise<boolean> {
	// public 始终可见
	if (post.visibility === 'public') {
		return true;
	}

	// logged_in：需要登录
	if (post.visibility === 'logged_in') {
		return currentUser !== null;
	}

	// followers：粉丝或作者本人可见
	if (post.visibility === 'followers') {
		if (!currentUser) return false;
		// 作者本人始终可见
		if (currentUser.userId === post.userId) return true;
		return !!options?.isFollower;
	}

	// following：作者关注的人或作者本人可见
	if (post.visibility === 'following') {
		if (!currentUser) return false;
		// 作者本人始终可见
		if (currentUser.userId === post.userId) return true;
		return !!options?.isFollowing;
	}

	// private：仅作者本人可见
	if (post.visibility === 'private') {
		if (!currentUser) return false;
		return currentUser.userId === post.userId;
	}

	// password：输入正确密码后可见
	if (post.visibility === 'password') {
		// 作者本人始终可见
		if (currentUser && currentUser.userId === post.userId) return true;
		// 没有密码哈希或未提供密码，不可见
		if (!post.passwordHash || !options?.password) return false;
		// 验证密码
		return verifyPassword(options.password, post.passwordHash);
	}

	// users：指定用户列表可见
	if (post.visibility === 'users') {
		if (!currentUser) return false;
		// 作者本人始终可见
		if (currentUser.userId === post.userId) return true;
		// 解析 allowedUserIds JSON 数组
		if (!post.allowedUserIds) return false;
		try {
			const allowedIds: string[] = JSON.parse(post.allowedUserIds);
			return allowedIds.includes(currentUser.userId);
		} catch {
			return false;
		}
	}

	// 未知可见度类型，默认不可见
	return false;
}

/** getVisibilityFilter 的可选参数 */
interface FilterOptions {
	/** 当前用户关注的用户 ID 列表 */
	followingIds?: string[];
	/** 关注当前用户的粉丝 ID 列表 */
	followerIds?: string[];
}

/**
 * 生成可见度过滤的 Prisma where 条件
 *
 * 根据场景生成不同的过滤条件：
 * - 公开时间线：只显示 visibility=public
 * - 用户主页：显示该用户对当前用户可见的帖子
 * - 关注时间线：显示关注用户的 public + followers + logged_in 帖子
 *
 * @param currentUser - 当前登录用户，null 表示未登录
 * @param options - 额外选项（关注列表、粉丝列表）
 * @returns Prisma where 条件对象
 */
export function getVisibilityFilter(
	currentUser: CurrentUser | null,
	options?: FilterOptions
): Prisma.PostWhereInput {
	// 未登录用户可以看到 public + password/users（受限提示）
	if (!currentUser) {
		return {
			OR: [{ visibility: 'public' }, { visibility: 'password' }, { visibility: 'users' }]
		};
	}

	const followingIds = options?.followingIds ?? [];
	const followerIds = options?.followerIds ?? [];

	// 构建可见度 OR 条件
	const visibilityConditions: Prisma.PostWhereInput[] = [
		// public 始终可见
		{ visibility: 'public' },
		// logged_in：已登录即可见
		{ visibility: 'logged_in' },
		// private：仅自己发的
		{ visibility: 'private', userId: currentUser.userId }
	];

	// followers：当前用户关注了作者（当前用户是作者的粉丝），作者发的帖子可见
	// followingIds 是当前用户关注的人列表，作者在其中意味着当前用户是作者的粉丝
	if (followingIds.length > 0) {
		visibilityConditions.push({
			visibility: 'followers',
			userId: { in: followingIds }
		});
	}
	// 自己发的 followers 帖子也可见
	visibilityConditions.push({
		visibility: 'followers',
		userId: currentUser.userId
	});

	// following：作者关注了当前用户（当前用户是作者关注的人），作者发的帖子可见
	// followerIds 是关注当前用户的人列表，作者在其中意味着作者关注了当前用户
	if (followerIds.length > 0) {
		visibilityConditions.push({
			visibility: 'following',
			userId: { in: followerIds }
		});
	}
	// 自己发的 following 帖子也可见
	visibilityConditions.push({
		visibility: 'following',
		userId: currentUser.userId
	});

	// password 和 users：非作者也能在列表中看到（但内容受限，由前端显示提示）
	// 这样用户可以知道存在受限帖子，点击后可输入密码或申请权限
	visibilityConditions.push({
		visibility: 'password'
	});
	visibilityConditions.push({
		visibility: 'users'
	});

	return {
		OR: visibilityConditions
	};
}

/**
 * 生成关注时间线的可见度过滤条件
 *
 * 关注时间线显示关注用户的 public + followers + logged_in 帖子
 *
 * @param followingIds - 当前用户关注的用户 ID 列表
 * @returns Prisma where 条件对象
 */
export function getFollowingTimelineFilter(
	currentUserId: string,
	followingIds: string[]
): Prisma.PostWhereInput {
	// 包含自己 + 关注用户的帖子
	const allIds = [...followingIds, currentUserId];
	return {
		userId: { in: allIds },
		visibility: { in: ['public', 'followers', 'logged_in'] }
	};
}
