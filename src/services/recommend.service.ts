/**
 * 本地推荐 Service
 *
 * 使用站内热门分数、标签和分类生成推荐结果，不依赖外部推荐服务。
 */
import { calculateTrendingScore, parseTrendingConfig, stableTrendingSort } from '@/lib/trending';
import { getEnv } from '@/lib/config';
import { prisma } from '@/lib/db';
import { POST_CARD_INCLUDE } from '@/lib/queries';
import { ServiceError } from '@/lib/errors';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { getLikedPostIds } from '@/lib/queries';
import { findFollowingIds, findFollowerIds } from '@/lib/social';
import {
	findRecommendationCandidates,
	findRecommendationSource,
	findRecommendUserCandidates,
	upsertPostRead
} from '@/lib/recommend';
import type { Prisma } from '../../generated/prisma/client';

const CANDIDATE_LIMIT = 200;
const READ_EXCLUSION_DAYS = 30;
const RECOMMEND_USER_CANDIDATE_LIMIT = 200;
const RECOMMEND_USER_ACTIVE_DAYS = 90;
export const RECOMMEND_USER_MIN_COUNT = 1;
export const RECOMMEND_USER_MAX_COUNT = 20;

export interface GetRecommendInput {
	userId: string;
	n?: number;
}

export interface RecommendItem {
	id: string;
	content: string;
	createdAt: string;
	user: { id: string; username: string; displayName: string; avatarUrl: string };
	media: Array<{ id: string; fileType: string }>;
	visibility: string;
	mode: string;
	title: string | null;
	categoryId: string | null;
	category: { id: string; name: string; slug: string; mode: string } | null;
	tags: Array<{ id: string; name: string }>;
	likeCount: number;
	commentCount: number;
	liked: boolean;
	/** 本地热门/相似度综合分，越高越靠前 */
	score: number;
	source?: 'interest' | 'trending' | 'exploration';
}

export interface GetRecommendResult {
	items: RecommendItem[];
	profile?: RecommendationProfile;
}

export interface TrendingFeedInput {
	viewerId?: string;
	page: number;
	pageSize: number;
	mode?: 'weibo' | 'forum' | 'blog';
	categoryId?: string;
	excludePostIds?: string[];
	/** Optional scope constraints, evaluated after the shared 200-post window. */
	postIds?: string[];
	userIds?: string[];
	keyword?: string;
	from?: Date;
	to?: Date;
	/** Only homepage and the weibo channel first page may prepend global pins. */
	includeGlobalPinned?: boolean;
}

export interface TrendingFeedItem {
	id: string;
	userId: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
	visibility: string;
	passwordHash: string | null;
	allowedUserIds: string | null;
	isPinned: boolean;
	isGlobalPinned: boolean;
	isLocked: boolean;
	isEdited: boolean;
	mode: string;
	title: string | null;
	categoryId: string | null;
	user: { id: string; username: string; displayName: string; avatarUrl: string };
	media: Array<{ id: string; fileType: string; fileStorage: { id: string; filePath: string; fileSize: number; mimeType: string; fileType: string } }>;
	tags: Array<{ tag: { id: string; name: string } }>;
	category: { id: string; name: string; slug: string; mode: string; icon: string } | null;
	_count: { likes: number; comments: number; bookmarks: number };
	liked: boolean;
	bookmarked: boolean;
	score: number;
	uniqueInteractorCount: number;
}

export interface TrendingFeedResult {
	items: TrendingFeedItem[];
	total: number;
	page: number;
	pageSize: number;
}

/** 首页右栏可安全展示的推荐用户字段。 */
export interface RecommendUserItem {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
	bio: string;
	followerCount: number;
	mutualFollowCount: number;
	latestPublicPostAt: string;
}

export interface GetRecommendUsersInput {
	userId: string;
	n?: number;
}

export interface GetRecommendUsersResult {
	items: RecommendUserItem[];
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

/**
 * The sole orchestration path for every hot feed.  It deliberately loads one
 * deterministic 200-post window before applying visibility, scope, scoring,
 * or pagination so databases cannot drift in their ranking behaviour.
 */
export async function getTrendingFeed(input: TrendingFeedInput): Promise<TrendingFeedResult> {
	const page = Math.max(1, Math.floor(input.page));
	const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize)));
	const viewerId = input.viewerId;
	const [followingIds, followerIds] = viewerId
		? await Promise.all([findFollowingIds(viewerId), findFollowerIds(viewerId)])
		: [[], []];

	// Do not add mode, category, visibility, or pin filters here: each is an
	// in-memory filter on the same fixed chronological candidate window.
	const candidates = await prisma.post.findMany({
		where: { isDeleted: false },
		orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
		take: CANDIDATE_LIMIT,
		include: POST_CARD_INCLUDE
	});

	const scoped = [] as typeof candidates;
	for (const post of candidates) {
		if (input.mode && post.mode !== input.mode) continue;
		if (input.categoryId && post.categoryId !== input.categoryId) continue;
		if (input.excludePostIds?.includes(post.id)) continue;
		if (input.postIds && !input.postIds.includes(post.id)) continue;
		if (input.userIds && !input.userIds.includes(post.userId)) continue;
		if (input.keyword && !post.content.includes(input.keyword) && !(post.title?.includes(input.keyword))) continue;
		if (input.from && post.createdAt < input.from) continue;
		if (input.to && post.createdAt > input.to) continue;
		if (post.isGlobalPinned) continue;
		const visible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			viewerId ? { userId: viewerId } : null,
			{ isFollower: followingIds.includes(post.userId), isFollowing: followerIds.includes(post.userId) }
		);
		if (visible) scoped.push(post);
	}

	const candidateIds = candidates.map((post) => post.id);
	// Exactly three bounded interaction queries; all aggregation and self-action
	// exclusion happens here, rather than in vendor-specific ranking SQL.
	const [likes, bookmarks, comments] = await Promise.all([
		prisma.like.findMany({ where: { postId: { in: candidateIds } }, select: { postId: true, userId: true } }),
		prisma.bookmark.findMany({ where: { postId: { in: candidateIds } }, select: { postId: true, userId: true } }),
		prisma.comment.findMany({ where: { postId: { in: candidateIds }, isDeleted: false }, select: { postId: true, userId: true } })
	]);
	const postAuthorIds = new Map(candidates.map((post) => [post.id, post.userId]));
	const collect = (rows: Array<{ postId: string | null; userId: string }>) => {
		const values = new Map<string, Set<string>>();
		for (const row of rows) {
			if (!row.postId || postAuthorIds.get(row.postId) === row.userId) continue;
			const users = values.get(row.postId) ?? new Set<string>();
			users.add(row.userId);
			values.set(row.postId, users);
		}
		return values;
	};
	const likesByPost = collect(likes);
	const bookmarksByPost = collect(bookmarks);
	const commentsByPost = collect(comments);
	const likedIds = viewerId ? new Set(likes.filter((row) => row.userId === viewerId).map((row) => row.postId)) : new Set<string | null>();
	const bookmarkedIds = viewerId ? new Set(bookmarks.filter((row) => row.userId === viewerId).map((row) => row.postId)) : new Set<string | null>();
	const config = parseTrendingConfig(getEnv('TRENDING_FORMULA'));
	const scored = stableTrendingSort(
		scoped.map((post) => {
			const interactors = new Set([
				...(likesByPost.get(post.id) ?? []),
				...(bookmarksByPost.get(post.id) ?? []),
				...(commentsByPost.get(post.id) ?? [])
			]);
			return {
				...post,
				liked: likedIds.has(post.id),
				bookmarked: bookmarkedIds.has(post.id),
				uniqueInteractorCount: interactors.size,
				score: calculateTrendingScore(
					{
						likes: likesByPost.get(post.id)?.size ?? 0,
						bookmarks: bookmarksByPost.get(post.id)?.size ?? 0,
						comments: commentsByPost.get(post.id)?.size ?? 0
					},
					post.createdAt,
					config
				)
			};
		})
	);
	const total = Math.min(scored.length, CANDIDATE_LIMIT);
	const start = (page - 1) * pageSize;
	let items = start >= total ? [] : scored.slice(start, start + pageSize);
	if (input.includeGlobalPinned && page === 1) {
		const pins = await prisma.post.findMany({
			where: { isDeleted: false, isGlobalPinned: true, ...(input.mode ? { mode: input.mode } : {}) },
			orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
			include: POST_CARD_INCLUDE
		});
		const visiblePins = [] as typeof pins;
		for (const pin of pins) {
			if (input.categoryId && pin.categoryId !== input.categoryId) continue;
			if (input.excludePostIds?.includes(pin.id)) continue;
			if (await checkPostVisibility({ visibility: pin.visibility, userId: pin.userId, passwordHash: pin.passwordHash, allowedUserIds: pin.allowedUserIds }, viewerId ? { userId: viewerId } : null, { isFollower: followingIds.includes(pin.userId), isFollowing: followerIds.includes(pin.userId) })) visiblePins.push(pin);
		}
		const pinItems = visiblePins.map((pin) => ({ ...pin, liked: likedIds.has(pin.id), bookmarked: bookmarkedIds.has(pin.id), uniqueInteractorCount: 0, score: 0 }));
		items = [...pinItems, ...items.filter((item) => !visiblePins.some((pin) => pin.id === item.id))];
	}
	return { items, total, page, pageSize };
}

/** 获取未读的站内热门帖子。 */
export async function getRecommend(input: GetRecommendInput): Promise<GetRecommendResult> {
	const count = input.n ?? 5;
	const profile = await getRecommendationProfile(input.userId);
	const feed = await getTrendingFeed({ viewerId: input.userId, page: 1, pageSize: Math.max(count, 50) });
	const ordered = profile.strategy === 'blended'
		? allocateBlendedRecommendations(feed.items, profile, count)
		: feed.items.map((post) => ({ post, source: 'trending' as const }));
	return {
		items: ordered.slice(0, count).map(({ post, source }) => ({
			id: post.id, content: post.content, createdAt: post.createdAt.toISOString(), user: post.user,
			media: post.media.map(({ id, fileType }) => ({ id, fileType })), visibility: post.visibility,
			mode: post.mode, title: post.title, categoryId: post.categoryId, category: post.category,
			tags: post.tags.map(({ tag }) => tag), likeCount: post._count.likes,
			commentCount: post._count.comments, liked: post.liked, score: post.score, source
		})), profile
	};
}

/** Deterministically compose 50% interest, 40% trending, and 10% exploration. */
export function allocateBlendedRecommendations(
	candidates: TrendingFeedItem[],
	profile: Pick<RecommendationProfile, 'interestTagIds' | 'interestCategoryIds'>,
	count: number
): Array<{ post: TrendingFeedItem; source: 'interest' | 'trending' | 'exploration' }> {
	const interestScore = (post: TrendingFeedItem) =>
		post.tags.filter(({ tag }) => profile.interestTagIds.includes(tag.id)).length +
		(profile.interestCategoryIds.includes(post.categoryId ?? '') ? 1 : 0);
	const interestCount = Math.floor(count * 0.5);
	const trendingCount = Math.floor(count * 0.4);
	const explorationCount = count - interestCount - trendingCount;
	const interest = candidates.filter((post) => interestScore(post) > 0)
		.sort((a, b) => interestScore(b) - interestScore(a) || b.score - a.score || a.id.localeCompare(b.id));
	const exploration = candidates.filter((post) => interestScore(post) === 0)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
	const chosen = new Set<string>();
	const output: Array<{ post: TrendingFeedItem; source: 'interest' | 'trending' | 'exploration' }> = [];
	const take = (items: TrendingFeedItem[], amount: number, source: 'interest' | 'trending' | 'exploration') => {
		for (const post of items) {
			if (output.length >= count || chosen.has(post.id)) continue;
			output.push({ post, source }); chosen.add(post.id);
			if (output.filter((item) => item.source === source).length >= amount) break;
		}
	};
	take(interest, interestCount, 'interest');
	take(candidates, trendingCount, 'trending');
	take(exploration, explorationCount, 'exploration');
	// Sparse pools still return a full page, without pretending fallback items are exploration.
	take(candidates, count, 'trending');
	return output;
}

/**
 * 获取首页右栏的推荐用户。
 *
 * 只读取最近 90 天的公开、未删除帖子；候选查询及当前关注查询各执行一次，
 * 后续排序仅处理有界候选集，避免 N+1 查询和非确定性排序。
 */
export async function getRecommendUsers(
	input: GetRecommendUsersInput
): Promise<GetRecommendUsersResult> {
	const count = normalizeRecommendUserCount(input.n);
	const publicPostSince = new Date(Date.now() - RECOMMEND_USER_ACTIVE_DAYS * 24 * 60 * 60 * 1000);
	const candidates = await findRecommendUserCandidates(
		input.userId,
		publicPostSince,
		RECOMMEND_USER_CANDIDATE_LIMIT
	);

	const items = candidates
		.map((candidate) => ({
			id: candidate.id,
			username: candidate.username,
			displayName: candidate.displayName,
			avatarUrl: candidate.avatarUrl,
			bio: candidate.bio,
			followerCount: Number(candidate.followerCount),
			mutualFollowCount: Number(candidate.mutualFollowCount),
			latestPublicPostAt: new Date(candidate.latestPublicPostAt).toISOString()
		}));

	return { items: items.slice(0, count) };
}

function normalizeRecommendUserCount(count: number | undefined): number {
	if (count === undefined) return 5;
	if (
		!Number.isInteger(count) ||
		count < RECOMMEND_USER_MIN_COUNT ||
		count > RECOMMEND_USER_MAX_COUNT
	) {
		throw new ServiceError('BAD_REQUEST', '推荐用户数量必须为 1 到 20 的整数');
	}
	return count;
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
			calculateTrendingScore(
				{ likes: post._count.likes, bookmarks: 0, comments: post._count.comments },
				post.createdAt
			)
		);
	});
	return { items: items.slice(0, count) };
}

/** 本地记录浏览历史，供热门推荐排除已读帖子。 */
export async function recordRead(input: RecordReadInput): Promise<{ recorded: true }> {
	await upsertPostRead(input.userId, input.postId);
	return { recorded: true };
}

export interface SaveInterestsInput {
	userId: string;
	tagIds: string[];
	categoryIds: string[];
	/** A skipped onboarding writes the completion time with empty interests. */
	skip?: boolean;
}

export interface RecommendationProfile {
	onboardingCompletedAt: Date | null;
	interestTagIds: string[];
	interestCategoryIds: string[];
	positiveSignalCount: number;
	coveredPostCount: number;
	coveredCreatorCount: number;
	strategy: 'cold_start' | 'blended';
	weights: { interest: number; trending: number; exploration: number };
}

/** Persists only explicit user choices and a completion/skip timestamp. */
export async function saveInterests(input: SaveInterestsInput): Promise<void> {
	const tagIds = [...new Set(input.skip ? [] : input.tagIds)];
	const categoryIds = [...new Set(input.skip ? [] : input.categoryIds)];
	await prisma.$transaction(async (tx) => {
		await tx.userSettings.upsert({
			where: { userId: input.userId },
			create: { userId: input.userId, interestOnboardingCompletedAt: new Date() },
			update: { interestOnboardingCompletedAt: new Date() }
		});
		await tx.userTagInterest.deleteMany({ where: { userId: input.userId } });
		await tx.userCategoryInterest.deleteMany({ where: { userId: input.userId } });
		if (tagIds.length) await tx.userTagInterest.createMany({ data: tagIds.map((tagId) => ({ userId: input.userId, tagId })) });
		if (categoryIds.length) await tx.userCategoryInterest.createMany({ data: categoryIds.map((categoryId) => ({ userId: input.userId, categoryId })) });
	});
}

/**
 * Counts deduplicated positive actions only. Reads intentionally affect only
 * exclusion elsewhere and never make a user leave cold-start mode.
 */
export async function getRecommendationProfile(userId: string): Promise<RecommendationProfile> {
	const [settings, tagInterests, categoryInterests, likes, bookmarks, comments, follows] = await Promise.all([
		prisma.userSettings.findUnique({ where: { userId }, select: { interestOnboardingCompletedAt: true } }),
		prisma.userTagInterest.findMany({ where: { userId }, select: { tagId: true } }),
		prisma.userCategoryInterest.findMany({ where: { userId }, select: { categoryId: true } }),
		prisma.like.findMany({ where: { userId, postId: { not: null } }, select: { postId: true, post: { select: { userId: true } } } }),
		prisma.bookmark.findMany({ where: { userId }, select: { postId: true, post: { select: { userId: true } } } }),
		prisma.comment.findMany({ where: { userId, isDeleted: false }, select: { postId: true, post: { select: { userId: true } } } }),
		prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
	]);
	const actions = new Set<string>();
	const posts = new Set<string>();
	const creators = new Set<string>();
	for (const row of likes) if (row.post && row.post.userId !== userId && row.postId) { actions.add(`like:${row.postId}`); posts.add(row.postId); creators.add(row.post.userId); }
	for (const row of bookmarks) if (row.post.userId !== userId) { actions.add(`bookmark:${row.postId}`); posts.add(row.postId); creators.add(row.post.userId); }
	for (const row of comments) if (row.post.userId !== userId) { actions.add(`comment:${row.postId}`); posts.add(row.postId); creators.add(row.post.userId); }
	for (const row of follows) if (row.followingId !== userId) { actions.add(`follow:${row.followingId}`); creators.add(row.followingId); }
	const blended = actions.size >= 5 && (posts.size >= 3 || creators.size >= 2);
	return {
		onboardingCompletedAt: settings?.interestOnboardingCompletedAt ?? null,
		interestTagIds: tagInterests.map((row) => row.tagId),
		interestCategoryIds: categoryInterests.map((row) => row.categoryId),
		positiveSignalCount: actions.size, coveredPostCount: posts.size, coveredCreatorCount: creators.size,
		strategy: blended ? 'blended' : 'cold_start',
		weights: blended ? { interest: 0.5, trending: 0.4, exploration: 0.1 } : { interest: 1, trending: 0, exploration: 0 }
	};
}
