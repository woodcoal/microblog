/**
 * 本地推荐数据库操作。
 *
 * 仅封装推荐所需的原子查询和写入，业务排序与权限判断由 Service 层负责。
 */
import { prisma } from '@/lib/db';
import { POST_CARD_INCLUDE } from '@/lib/queries';
import type { Prisma } from '../../generated/prisma/client';

const RECOMMEND_USER_SELECT = {
	id: true,
	username: true,
	displayName: true,
	avatarUrl: true,
	bio: true
} as const;

/** 查询推荐候选帖，默认按发布时间由新到旧返回。 */
export function findRecommendationCandidates(
	userId: string,
	visibilityFilter: Prisma.PostWhereInput,
	where: Prisma.PostWhereInput,
	readAfter: Date,
	limit: number
) {
	return prisma.post.findMany({
		where: {
			isDeleted: false,
			AND: [visibilityFilter, where],
			reads: { none: { userId, createdAt: { gte: readAfter } } }
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		include: POST_CARD_INCLUDE
	});
}

/** 查询相似推荐的源帖特征及权限字段。 */
export function findRecommendationSource(postId: string) {
	return prisma.post.findUnique({
		where: { id: postId },
		select: {
			userId: true,
			visibility: true,
			passwordHash: true,
			allowedUserIds: true,
			isDeleted: true,
			categoryId: true,
			tags: { select: { tagId: true } }
		}
	});
}

/**
 * 查询首页推荐用户的有界候选集。
 *
 * 共同关注统计基于“当前用户和候选人都关注的用户”计算。当前用户的关注 ID
 * 由调用方一次性提供，使查询始终保持固定次数，避免对每个候选人单独计数。
 */
export function findRecommendUserCandidates(
	userId: string,
	currentFollowingIds: string[],
	publicPostSince: Date,
	limit: number
) {
	const publicPostWhere: Prisma.PostWhereInput = {
		isDeleted: false,
		visibility: 'public',
		createdAt: { gte: publicPostSince }
	};

	return prisma.user.findMany({
		where: {
			id: { not: userId },
			isDisabled: false,
			// User.following 是以该用户为被关注方的关系，即其粉丝。
			following: { none: { followerId: userId } },
			posts: { some: publicPostWhere }
		},
		select: {
			...RECOMMEND_USER_SELECT,
			posts: {
				where: publicPostWhere,
				orderBy: { createdAt: 'desc' },
				take: 1,
				select: { createdAt: true }
			},
			_count: {
				select: {
					// User.following 代表该用户拥有的粉丝数。
					following: true,
					// User.followers 代表该用户主动关注的关系。
					followers: { where: { followingId: { in: currentFollowingIds } } },
					posts: { where: publicPostWhere }
				}
			}
		},
		// 限制候选集时先给出稳定顺序，避免底层数据库的任意行顺序泄漏到结果。
		orderBy: { username: 'asc' },
		take: limit
	});
}

/** 幂等记录用户已阅读的帖子。 */
export function upsertPostRead(userId: string, postId: string) {
	const readAt = new Date();
	return prisma.postRead.upsert({
		where: { userId_postId: { userId, postId } },
		create: { userId, postId, createdAt: readAt },
		update: { createdAt: readAt }
	});
}
