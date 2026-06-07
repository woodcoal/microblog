/**
 * 推荐系统 Service
 *
 * 编排个性化推荐和浏览记录的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import {
	isGorseEnabled,
	getRecommendations as gorseGetRecommend,
	insertFeedback,
	FEEDBACK_TYPE_READ
} from '@/lib/gorse';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { POST_CARD_INCLUDE, getLikedPostIds } from '@/lib/queries';

// ── 类型定义 ──

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
}

export interface GetRecommendResult {
	items: RecommendItem[];
}

export interface RecordReadInput {
	userId: string;
	postId: string;
}

// ── 业务函数 ──

/**
 * 获取个性化推荐
 *
 * 根据用户历史行为，返回 Gorse 推荐引擎生成的个性化帖子列表。
 * Gorse 未配置时返回空列表。
 * 返回的帖子经过可见度过滤，确保用户只能看到有权限的内容。
 *
 * @param input - { userId, n? }
 * @returns 推荐帖子列表
 */
export async function getRecommend(input: GetRecommendInput): Promise<GetRecommendResult> {
	const { userId, n } = input;

	// Gorse 未启用时返回空列表
	if (!isGorseEnabled()) {
		return { items: [] };
	}

	const count = n ?? 5;

	// 从 Gorse 获取推荐帖子 ID
	const recommendedIds = await gorseGetRecommend(userId, { n: count });

	if (recommendedIds.length === 0) {
		return { items: [] };
	}

	// 查询当前用户的关注关系，用于可见度过滤
	const followingIds: string[] = [];
	const followerIds: string[] = [];
	const follows = await prisma.follow.findMany({
		where: { followerId: userId },
		select: { followingId: true }
	});
	followingIds.push(...follows.map((f) => f.followingId));
	const followers = await prisma.follow.findMany({
		where: { followingId: userId },
		select: { followerId: true }
	});
	followerIds.push(...followers.map((f) => f.followerId));

	const visibilityFilter = getVisibilityFilter({ userId }, { followingIds, followerIds });

	// 从数据库查询推荐帖子的详细信息
	const posts = await prisma.post.findMany({
		where: {
			id: { in: recommendedIds },
			isDeleted: false,
			...visibilityFilter
		},
		include: {
			...POST_CARD_INCLUDE,
			likes: { select: { id: true, userId: true } },
			comments: { select: { id: true } }
		}
	});

	// 逐条验证可见度（处理 password/users 等需要逐条验证的可见度类型）
	const visiblePosts = [];
	for (const post of posts) {
		const isVisible = await checkPostVisibility(
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
		if (isVisible) {
			visiblePosts.push(post);
		}
	}

	// 按推荐顺序排列（Gorse 返回的顺序即推荐优先级）
	const orderedPosts = recommendedIds
		.map((id) => visiblePosts.find((p) => p.id === id))
		.filter(Boolean);

	// 查询点赞状态
	const likedPostIds = await getLikedPostIds(
		userId,
		orderedPosts.map((p) => p!.id)
	);

	// 格式化返回数据
	const items = orderedPosts.map((post) => ({
		id: post!.id,
		content: post!.content,
		createdAt: post!.createdAt.toISOString(),
		user: post!.user,
		media: post!.media,
		visibility: post!.visibility,
		mode: post!.mode,
		title: post!.title,
		categoryId: post!.categoryId,
		category: post!.category,
		tags: post!.tags.map((pt: any) => ({ id: pt.tag.id, name: pt.tag.name })),
		likeCount: post!._count.likes,
		commentCount: post!._count.comments,
		liked: likedPostIds.has(post!.id)
	}));

	return { items };
}

/**
 * 记录浏览行为
 *
 * 将用户浏览帖子的行为异步记录到 Gorse 推荐引擎。
 * 浏览反馈（read）用于去重：已看过的帖子不再推荐。
 * Gorse 未配置时静默返回成功。
 *
 * @param input - { userId, postId }
 * @returns 记录成功
 */
export async function recordRead(input: RecordReadInput): Promise<{ recorded: true }> {
	const { userId, postId } = input;

	// Gorse 未启用时静默返回成功
	if (!isGorseEnabled()) {
		return { recorded: true };
	}

	// 异步插入浏览反馈（不等待结果，直接返回成功）
	insertFeedback(userId, postId, FEEDBACK_TYPE_READ, new Date().toISOString()).catch(() => {});

	return { recorded: true };
}
