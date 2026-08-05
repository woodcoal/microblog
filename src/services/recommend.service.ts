/**
 * 本地推荐 Service
 *
 * 使用站内热门分数、标签和分类生成推荐结果，不依赖外部推荐服务。
 */
import { calculateTrendingScore } from '@/lib/trending';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { getLikedPostIds } from '@/lib/queries';
import { findFollowingIds, findFollowerIds } from '@/lib/social';
import {
	findRecommendationCandidates,
	findRecommendationSource,
	upsertPostRead
} from '@/lib/recommend';
import type { Prisma } from '../../generated/prisma/client';

const CANDIDATE_LIMIT = 200;
const READ_EXCLUSION_DAYS = 30;

export interface GetRecommendInput {
	userId: string;
	n?: number;
}

export interface RecommendItem {
	id: string;
	content: string;
	createdAt: string;
	user: any;
	media: any;
	visibility: string;
	mode: string;
	title: string | null;
	categoryId: string | null;
	category: any;
	tags: Array<{ id: string; name: string }>;
	likeCount: number;
	commentCount: number;
	liked: boolean;
	/** 本地热门/相似度综合分，越高越靠前 */
	score: number;
}

export interface GetRecommendResult {
	items: RecommendItem[];
}

export interface RecordReadInput {
	userId: string;
	postId: string;
}

export interface GetSimilarPostsInput {
	userId: string;
	postId: string;
	n?: number;
}

async function getVisibleCandidates(userId: string, where: Prisma.PostWhereInput = {}) {
	const [followingIds, followerIds] = await Promise.all([
		findFollowingIds(userId),
		findFollowerIds(userId)
	]);
	const visibilityFilter = getVisibilityFilter({ userId }, { followingIds, followerIds });
	const readAfter = new Date(Date.now() - READ_EXCLUSION_DAYS * 24 * 60 * 60 * 1000);
	const posts = await findRecommendationCandidates(
		userId,
		visibilityFilter,
		where,
		readAfter,
		CANDIDATE_LIMIT
	);

	const visiblePosts: typeof posts = [];
	for (const post of posts) {
		const visible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			{ userId },
			{
				isFollower: followingIds.includes(post.userId),
				isFollowing: followerIds.includes(post.userId)
			}
		);
		if (visible) visiblePosts.push(post);
	}

	return visiblePosts;
}

async function formatItems(
	userId: string,
	posts: Awaited<ReturnType<typeof getVisibleCandidates>>,
	scoreFor: (post: (typeof posts)[number]) => number
) {
	const likedPostIds = await getLikedPostIds(
		userId,
		posts.map((post) => post.id)
	);

	return posts
		.map((post) => ({
			id: post.id,
			content: post.content,
			createdAt: post.createdAt.toISOString(),
			user: post.user,
			media: post.media,
			visibility: post.visibility,
			mode: post.mode,
			title: post.title,
			categoryId: post.categoryId,
			category: post.category,
			tags: post.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
			likeCount: post._count.likes,
			commentCount: post._count.comments,
			liked: likedPostIds.has(post.id),
			score: scoreFor(post)
		}))
		.sort((a, b) => b.score - a.score);
}

/** 获取未读的站内热门帖子。 */
export async function getRecommend(input: GetRecommendInput): Promise<GetRecommendResult> {
	const count = input.n ?? 5;
	const posts = await getVisibleCandidates(input.userId, { userId: { not: input.userId } });
	const items = await formatItems(input.userId, posts, (post) =>
		calculateTrendingScore(post._count.likes, post._count.comments, post.createdAt)
	);
	return { items: items.slice(0, count) };
}

/** 按共享标签、相同分类和热门度查找未读相关推荐。 */
export async function getSimilarPosts(input: GetSimilarPostsInput): Promise<GetRecommendResult> {
	const count = input.n ?? 5;
	const [source, followingIds, followerIds] = await Promise.all([
		findRecommendationSource(input.postId),
		findFollowingIds(input.userId),
		findFollowerIds(input.userId)
	]);
	if (!source || source.isDeleted) return { items: [] };

	const sourceVisible = await checkPostVisibility(
		{
			visibility: source.visibility,
			userId: source.userId,
			passwordHash: source.passwordHash,
			allowedUserIds: source.allowedUserIds
		},
		{ userId: input.userId },
		{
			isFollower: followingIds.includes(source.userId),
			isFollowing: followerIds.includes(source.userId)
		}
	);
	if (!sourceVisible) return { items: [] };

	const tagIds = source.tags.map((tag) => tag.tagId);
	const similarity: Prisma.PostWhereInput[] = [];
	if (tagIds.length > 0) similarity.push({ tags: { some: { tagId: { in: tagIds } } } });
	if (source.categoryId) similarity.push({ categoryId: source.categoryId });
	if (similarity.length === 0) return { items: [] };

	const posts = await getVisibleCandidates(input.userId, {
		id: { not: input.postId },
		userId: { not: input.userId },
		AND: [{ OR: similarity }]
	});
	const items = await formatItems(input.userId, posts, (post) => {
		const sharedTags = post.tags.filter(({ tagId }) => tagIds.includes(tagId)).length;
		const categoryBonus = post.categoryId === source.categoryId ? 2 : 0;
		return (
			sharedTags * 3 +
			categoryBonus +
			calculateTrendingScore(post._count.likes, post._count.comments, post.createdAt)
		);
	});
	return { items: items.slice(0, count) };
}

/** 本地记录浏览历史，供热门推荐排除已读帖子。 */
export async function recordRead(input: RecordReadInput): Promise<{ recorded: true }> {
	await upsertPostRead(input.userId, input.postId);
	return { recorded: true };
}
