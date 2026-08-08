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
export function findRecommendUserCandidates(userId: string, publicPostSince: Date, limit: number) {
	return prisma.$queryRaw<RecommendUserCandidate[]>(
		recommendUserCandidatesQuery(userId, publicPostSince, limit)
	);
}

/** SQLite 查询计划行，仅用于推荐查询的性能回归测试。 */
export interface RecommendUserCandidateQueryPlanRow {
	detail: string;
}

/** 返回候选查询计划，以验证统计使用独立相关子查询而非多路明细并联。 */
export function explainRecommendUserCandidates(
	userId: string,
	publicPostSince: Date,
	limit: number
) {
	return prisma.$queryRaw<RecommendUserCandidateQueryPlanRow[]>(Prisma.sql`
		EXPLAIN QUERY PLAN ${recommendUserCandidatesQuery(userId, publicPostSince, limit)}
	`);
}

/**
 * 构造候选查询：每项统计都以 candidate.id 为键独立计算，禁止将 Post 与两条
 * Follow 一对多关系直接并联。这样不会产生帖子数 × 粉丝数 × 主动关注数的中间行。
 */
function recommendUserCandidatesQuery(userId: string, publicPostSince: Date, limit: number) {
	return Prisma.sql`
		SELECT
			candidate.\`id\`,
			candidate.\`username\`,
			candidate.\`displayName\`,
			candidate.\`avatarUrl\`,
			candidate.\`bio\`,
			(
				SELECT COUNT(*)
				FROM \`Follow\` AS follower
				WHERE follower.\`followingId\` = candidate.\`id\`
			) AS \`followerCount\`,
			(
				SELECT COUNT(*)
				FROM \`Follow\` AS candidateFollowing
				INNER JOIN \`Follow\` AS viewerFollowing
					ON viewerFollowing.\`followingId\` = candidateFollowing.\`followingId\`
					AND viewerFollowing.\`followerId\` = ${userId}
				WHERE candidateFollowing.\`followerId\` = candidate.\`id\`
			) AS \`mutualFollowCount\`,
			(
				SELECT COUNT(*)
				FROM \`Post\` AS publicPost
				WHERE publicPost.\`userId\` = candidate.\`id\`
					AND publicPost.\`isDeleted\` = false
					AND publicPost.\`visibility\` = 'public'
					AND publicPost.\`createdAt\` >= ${publicPostSince}
			) AS \`publicPostCount\`,
			(
				SELECT MAX(publicPost.\`createdAt\`)
				FROM \`Post\` AS publicPost
				WHERE publicPost.\`userId\` = candidate.\`id\`
					AND publicPost.\`isDeleted\` = false
					AND publicPost.\`visibility\` = 'public'
					AND publicPost.\`createdAt\` >= ${publicPostSince}
			) AS \`latestPublicPostAt\`
		FROM \`User\` AS candidate
		WHERE candidate.\`id\` <> ${userId}
			AND candidate.\`isDisabled\` = false
			AND EXISTS (
				SELECT 1
				FROM \`Post\` AS publicPost
				WHERE publicPost.\`userId\` = candidate.\`id\`
					AND publicPost.\`isDeleted\` = false
					AND publicPost.\`visibility\` = 'public'
					AND publicPost.\`createdAt\` >= ${publicPostSince}
			)
			AND NOT EXISTS (
				SELECT 1
				FROM \`Follow\` AS existingFollow
				WHERE existingFollow.\`followerId\` = ${userId}
					AND existingFollow.\`followingId\` = candidate.\`id\`
			)
		ORDER BY
			\`mutualFollowCount\` DESC,
			\`publicPostCount\` DESC,
			\`followerCount\` DESC,
			\`latestPublicPostAt\` DESC,
			candidate.\`username\` ASC
		LIMIT ${limit}
	`;
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
