/**
 * 推荐系统 Service
 *
 * 编排个性化推荐、相似推荐和浏览记录的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 * 底层调用 DaLi.Lens 推荐与搜索中间件。
 */
import {
	isLensEnabled,
	getRecommendations as lensGetRecommendations,
	getSimilarDocuments as lensGetSimilarDocuments,
	getUserProfile as lensGetUserProfile,
	submitFeedback,
	FEEDBACK_ACTION_VIEW,
	type LensRecommendationItem
} from '@/lib/lens';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { POST_CARD_INCLUDE, getLikedPostIds } from '@/lib/queries';
import { findFollowingIds, findFollowerIds } from '@/lib/social';
import { findPostsByIds } from '@/lib/post';

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
	/** DaLi.Lens 推荐匹配分（0~1），越高越匹配 */
	score?: number;
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

export interface GetUserProfileInput {
	userId: string;
}

export interface GetUserProfileResult {
	interactionCount: number;
	topCategories: Array<{ category: string; weight: number }>;
}

// ── 内部工具 ──

/**
 * 根据 Lens 推荐结果查询帖子并应用可见度过滤
 *
 * Lens 返回的 documentId 即帖子短链 ID，按推荐顺序查询数据库，
 * 逐条验证可见度后按推荐优先级排序返回。
 *
 * @param userId - 当前用户 ID
 * @param recommendations - Lens 推荐项列表
 * @returns 过滤并格式化后的帖子列表
 */
async function mapRecommendationsToPosts(
	userId: string,
	recommendations: LensRecommendationItem[]
): Promise<RecommendItem[]> {
	if (recommendations.length === 0) {
		return [];
	}

	// 提取帖子 ID 列表
	const recommendedIds = recommendations.map((r) => r.documentId);

	// 查询当前用户的关注关系，用于可见度过滤
	const [followingIds, followerIds] = await Promise.all([
		findFollowingIds(userId),
		findFollowerIds(userId)
	]);

	const visibilityFilter = getVisibilityFilter({ userId }, { followingIds, followerIds });

	// 从数据库查询推荐帖子的详细信息
	const posts = await findPostsByIds(
		recommendedIds,
		{
			isDeleted: false,
			...visibilityFilter
		},
		{
			...POST_CARD_INCLUDE,
			likes: { select: { id: true, userId: true } },
			comments: { select: { id: true } }
		}
	);

	// 逐条验证可见度（处理 password/users 等需要逐条验证的可见度类型）
	const visiblePosts: any[] = [];
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

	// 按推荐顺序排列（Lens 返回的顺序即推荐优先级）
	const scoreMap = new Map(recommendations.map((r) => [r.documentId, r.score]));
	const orderedPosts = recommendedIds
		.map((id) => visiblePosts.find((p) => p.id === id))
		.filter(Boolean);

	// 查询点赞状态
	const likedPostIds = await getLikedPostIds(
		userId,
		orderedPosts.map((p) => p!.id)
	);

	// 格式化返回数据
	return orderedPosts.map((post) => ({
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
		liked: likedPostIds.has(post!.id),
		score: scoreMap.get(post!.id)
	}));
}

// ── 业务函数 ──

/**
 * 获取个性化推荐
 *
 * 根据用户画像，返回 DaLi.Lens 推荐引擎生成的个性化帖子列表。
 * Lens 未配置时返回空列表。
 * 返回的帖子经过可见度过滤，确保用户只能看到有权限的内容。
 * 新用户（无画像）会收到最近入库的热门文档（冷启动处理）。
 *
 * @param input - { userId, n? }
 * @returns 推荐帖子列表
 */
export async function getRecommend(input: GetRecommendInput): Promise<GetRecommendResult> {
	const { userId, n } = input;

	// Lens 未启用时返回空列表
	if (!isLensEnabled()) {
		return { items: [] };
	}

	const count = n ?? 5;

	// 从 Lens 获取推荐
	const recommendations = await lensGetRecommendations(userId, { topK: count });

	// 映射为帖子数据
	const items = await mapRecommendationsToPosts(userId, recommendations);

	return { items };
}

/**
 * 获取相似帖子
 *
 * 查找与指定帖子相似的其他帖子，用于详情页"相关推荐"。
 * Lens 未配置时返回空列表。
 *
 * @param input - { userId, postId, n? }
 * @returns 相似帖子列表
 */
export async function getSimilarPosts(input: GetSimilarPostsInput): Promise<GetRecommendResult> {
	const { userId, postId, n } = input;

	if (!isLensEnabled()) {
		return { items: [] };
	}

	const count = n ?? 5;
	const recommendations = await lensGetSimilarDocuments(userId, postId, count);
	const items = await mapRecommendationsToPosts(userId, recommendations);

	return { items };
}

/**
 * 记录浏览行为
 *
 * 将用户浏览帖子的行为同步到 DaLi.Lens，用于更新用户画像。
 * 浏览反馈（view）作为弱正向信号，帮助推荐系统理解用户兴趣。
 * Lens 未配置时静默返回成功。
 *
 * @param input - { userId, postId }
 * @returns 记录成功
 */
export async function recordRead(input: RecordReadInput): Promise<{ recorded: true }> {
	const { userId, postId } = input;

	// Lens 未启用时静默返回成功
	if (!isLensEnabled()) {
		return { recorded: true };
	}

	// 异步提交浏览反馈（不等待结果，直接返回成功）
	submitFeedback(userId, postId, FEEDBACK_ACTION_VIEW).catch(() => {});

	return { recorded: true };
}

/**
 * 获取用户画像
 *
 * 返回用户在 DaLi.Lens 中的兴趣画像，包括交互统计和分类偏好。
 * 用于在设置页或个人主页展示用户兴趣标签。
 * 新用户或 Lens 未配置时返回空画像。
 *
 * @param input - { userId }
 * @returns 用户画像数据
 */
export async function getUserProfile(input: GetUserProfileInput): Promise<GetUserProfileResult> {
	const { userId } = input;

	if (!isLensEnabled()) {
		return { interactionCount: 0, topCategories: [] };
	}

	const profile = await lensGetUserProfile(userId);

	if (!profile) {
		return { interactionCount: 0, topCategories: [] };
	}

	return {
		interactionCount: profile.interactionCount,
		topCategories: profile.topCategories
	};
}
