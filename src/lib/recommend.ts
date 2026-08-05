/**
 * 本地推荐数据库操作。
 *
 * 仅封装推荐所需的原子查询和写入，业务排序与权限判断由 Service 层负责。
 */
import { prisma } from '@/lib/db';
import { POST_CARD_INCLUDE } from '@/lib/queries';
import type { Prisma } from '../../generated/prisma/client';

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

/** 幂等记录用户已阅读的帖子。 */
export function upsertPostRead(userId: string, postId: string) {
	const readAt = new Date();
	return prisma.postRead.upsert({
		where: { userId_postId: { userId, postId } },
		create: { userId, postId, createdAt: readAt },
		update: { createdAt: readAt }
	});
}
