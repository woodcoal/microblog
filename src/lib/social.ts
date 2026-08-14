/**
 * 社交互动数据库操作模块
 *
 * 提供点赞、关注、收藏等社交功能的 CRUD 原子操作，供 Service 层调用。
 * 所有函数均为纯数据库操作，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

// ── 点赞（Like）查询 ──

/**
 * 查询帖子的点赞列表
 *
 * 使用泛型推断 include 的返回类型，确保关联字段类型正确。
 *
 * @param postId - 帖子 ID
 * @param include - 关联查询配置
 * @param orderBy - 排序条件（可选）
 * @returns 点赞记录列表（包含 include 指定的关联字段）
 */
export function findLikesByPostId<T extends Prisma.LikeInclude>(
	postId: string,
	include: T,
	orderBy?: Prisma.LikeOrderByWithRelationInput
) {
	return prisma.like.findMany({
		where: { postId },
		include,
		...(orderBy ? { orderBy } : {})
	});
}

/**
 * 统计点赞数
 *
 * @param where - 筛选条件
 * @returns 符合条件的点赞数量
 */
export function countLikes(where: Prisma.LikeWhereInput) {
	return prisma.like.count({ where });
}

/**
 * 查询用户关注的用户 ID 列表
 *
 * @param userId - 用户 ID
 * @returns 该用户关注的所有用户 ID 数组
 */
export async function findFollowingIds(userId: string): Promise<string[]> {
	const follows = await prisma.follow.findMany({
		where: { followerId: userId },
		select: { followingId: true }
	});
	return follows.map((f) => f.followingId);
}

/**
 * 查询用户的粉丝 ID 列表
 *
 * @param userId - 用户 ID
 * @returns 关注该用户的所有粉丝 ID 数组
 */
export async function findFollowerIds(userId: string): Promise<string[]> {
	const follows = await prisma.follow.findMany({
		where: { followingId: userId },
		select: { followerId: true }
	});
	return follows.map((f) => f.followerId);
}

/**
 * 查询点赞记录（按复合唯一键）
 *
 * @param where - 点赞唯一键条件（userId_postId 或 userId_commentId）
 * @returns 点赞记录，不存在则返回 null
 */
export function findLike(where: Prisma.LikeWhereUniqueInput) {
	return prisma.like.findUnique({ where });
}

/**
 * 点赞 upsert（已存在则忽略）
 *
 * 用于安全创建点赞记录，避免竞态条件下重复插入。
 * 若记录已存在，update 为空操作（不更新任何字段）。
 *
 * @param where - 点赞唯一键条件
 * @param create - 点赞创建数据
 * @returns 创建或已存在的点赞记录
 */
export function upsertLike(
	where: Prisma.LikeWhereUniqueInput,
	create: Prisma.LikeUncheckedCreateInput
) {
	return prisma.like.upsert({
		where,
		update: {},
		create
	});
}

/**
 * 删除点赞记录
 *
 * @param where - 点赞唯一键条件
 * @returns 被删除的点赞记录
 */
export function deleteLike(where: Prisma.LikeWhereUniqueInput) {
	return prisma.like.delete({ where });
}

/** 点赞切换和作者活跃时间同一事务提交。 */
export async function toggleLikeWithActivity(input: {
	where: Prisma.LikeWhereUniqueInput;
	create: Prisma.LikeUncheckedCreateInput;
	existing: boolean;
	userId: string;
}) {
	return prisma.$transaction(async (tx) => {
		if (input.existing) {
			try {
				await tx.like.delete({ where: input.where });
			} catch (error) {
				if (!(
					typeof error === 'object' &&
					error !== null &&
					'code' in error &&
					error.code === 'P2025'
				))
					throw error;
			}
		} else {
			await tx.like.upsert({ where: input.where, update: {}, create: input.create });
		}
		await tx.user.update({ where: { id: input.userId }, data: { lastActiveAt: new Date() } });
		return !input.existing;
	});
}

// ── 关注（Follow）操作 ──

/**
 * 查询关注记录
 *
 * @param where - 关注唯一键条件（followerId_followingId）
 * @returns 关注记录，不存在则返回 null
 */
export function findFollow(where: Prisma.FollowWhereUniqueInput) {
	return prisma.follow.findUnique({ where });
}

/**
 * 关注 upsert（已存在则忽略）
 *
 * 用于安全创建关注记录，避免竞态条件下重复插入。
 * 若记录已存在，update 为空操作（不更新任何字段）。
 *
 * @param where - 关注唯一键条件
 * @param create - 关注创建数据
 * @returns 创建或已存在的关注记录
 */
export function upsertFollow(
	where: Prisma.FollowWhereUniqueInput,
	create: Prisma.FollowUncheckedCreateInput
) {
	return prisma.follow.upsert({
		where,
		update: {},
		create
	});
}

/**
 * 删除关注记录
 *
 * @param where - 关注唯一键条件
 * @returns 被删除的关注记录
 */
export function deleteFollow(where: Prisma.FollowWhereUniqueInput) {
	return prisma.follow.delete({ where });
}

/**
 * 统计关注数量
 *
 * @param where - 筛选条件（如 { followingId } 统计粉丝数，{ followerId } 统计关注数）
 * @returns 符合条件的关注数量
 */
export function countFollows(where: Prisma.FollowWhereInput) {
	return prisma.follow.count({ where });
}

// ── 收藏（Bookmark）操作 ──

/**
 * 查询收藏记录
 *
 * @param where - 收藏唯一键条件（userId_postId）
 * @returns 收藏记录，不存在则返回 null
 */
export function findBookmark(where: Prisma.BookmarkWhereUniqueInput) {
	return prisma.bookmark.findUnique({ where });
}

/**
 * 收藏 upsert（已存在则忽略）
 *
 * 用于安全创建收藏记录，避免竞态条件下重复插入。
 * 若记录已存在，update 为空操作（不更新任何字段）。
 *
 * @param where - 收藏唯一键条件
 * @param create - 收藏创建数据
 * @returns 创建或已存在的收藏记录
 */
export function upsertBookmark(
	where: Prisma.BookmarkWhereUniqueInput,
	create: Prisma.BookmarkUncheckedCreateInput
) {
	return prisma.bookmark.upsert({
		where,
		update: {},
		create
	});
}

/**
 * 删除收藏记录
 *
 * @param where - 收藏唯一键条件
 * @returns 被删除的收藏记录
 */
export function deleteBookmark(where: Prisma.BookmarkWhereUniqueInput) {
	return prisma.bookmark.delete({ where });
}

/**
 * 统计收藏数量
 *
 * @param where - 筛选条件
 * @returns 符合条件的收藏数量
 */
export function countBookmarks(where: Prisma.BookmarkWhereInput) {
	return prisma.bookmark.count({ where });
}
