/**
 * 本地推荐数据库操作。
 *
 * 仅封装推荐所需的原子查询和写入，业务排序与权限判断由 Service 层负责。
 */
import { prisma } from '@/lib/db';
import { POST_CARD_INCLUDE } from '@/lib/queries';
import { Prisma } from '../../generated/prisma/client';

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
 * 聚合、业务排序和候选上限必须在同一条 SQL 中完成：若先按用户名截断，用户名
 * 靠后的高分候选会被错误排除。查询只返回展示契约所需的公开资料和统计字段，避免
 * 在 Service 层为每个候选执行额外查询。
 */
export function findRecommendUserCandidates(
	userId: string,
	publicPostSince: Date,
	limit: number
) {
	return prisma.$queryRaw<RecommendUserCandidate[]>(Prisma.sql`
		SELECT
			candidate.\`id\`,
			candidate.\`username\`,
			candidate.\`displayName\`,
			candidate.\`avatarUrl\`,
			candidate.\`bio\`,
			COUNT(DISTINCT follower.\`followerId\`) AS \`followerCount\`,
			COUNT(DISTINCT viewerFollowing.\`followingId\`) AS \`mutualFollowCount\`,
			COUNT(DISTINCT publicPost.\`id\`) AS \`publicPostCount\`,
			MAX(publicPost.\`createdAt\`) AS \`latestPublicPostAt\`
		FROM \`User\` AS candidate
		INNER JOIN \`Post\` AS publicPost
			ON publicPost.\`userId\` = candidate.\`id\`
			AND publicPost.\`isDeleted\` = false
			AND publicPost.\`visibility\` = 'public'
			AND publicPost.\`createdAt\` >= ${publicPostSince}
		LEFT JOIN \`Follow\` AS follower ON follower.\`followingId\` = candidate.\`id\`
		LEFT JOIN \`Follow\` AS candidateFollowing ON candidateFollowing.\`followerId\` = candidate.\`id\`
		LEFT JOIN \`Follow\` AS viewerFollowing
			ON viewerFollowing.\`followerId\` = ${userId}
			AND viewerFollowing.\`followingId\` = candidateFollowing.\`followingId\`
		WHERE candidate.\`id\` <> ${userId}
			AND candidate.\`isDisabled\` = false
			AND NOT EXISTS (
				SELECT 1
				FROM \`Follow\` AS existingFollow
				WHERE existingFollow.\`followerId\` = ${userId}
					AND existingFollow.\`followingId\` = candidate.\`id\`
			)
		GROUP BY candidate.\`id\`, candidate.\`username\`, candidate.\`displayName\`, candidate.\`avatarUrl\`, candidate.\`bio\`
		ORDER BY
			\`mutualFollowCount\` DESC,
			\`publicPostCount\` DESC,
			\`followerCount\` DESC,
			\`latestPublicPostAt\` DESC,
			candidate.\`username\` ASC
		LIMIT ${limit}
	`);
}

/** 原始聚合查询返回的内部行；只在 lib → service 边界使用。 */
export interface RecommendUserCandidate {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
	bio: string;
	followerCount: number | bigint;
	mutualFollowCount: number | bigint;
	publicPostCount: number | bigint;
	latestPublicPostAt: Date | string;
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
