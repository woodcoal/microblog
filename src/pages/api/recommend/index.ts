/**
 * 个性化推荐 API
 *
 * 根据用户历史行为，返回 Gorse 推荐引擎生成的个性化帖子列表。
 * 需要登录认证。Gorse 未配置时返回空列表。
 * 返回的帖子经过可见度过滤，确保用户只能看到有权限的内容。
 */
import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRecommendations, isGorseEnabled } from '@/lib/gorse';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { POST_CARD_INCLUDE, getLikedPostIds } from '@/lib/queries';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

export const GET: APIRoute = async ({ request, url }) => {
	// 1. 验证登录状态
	const currentUser = await getUserFromRequest({ request } as any);
	if (!currentUser) {
		return jsonErrorResponse('请先登录', 401);
	}

	// 2. Gorse 未启用时返回空列表
	if (!isGorseEnabled()) {
		return new Response(JSON.stringify(successResponse({ items: [] })), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 3. 从查询参数获取配置
	const n = Math.min(Math.max(parseInt(url.searchParams.get('n') || '10', 10), 1), 50);
	const category = url.searchParams.get('category') || undefined;

	// 4. 从 Gorse 获取推荐帖子 ID
	const recommendedIds = await getRecommendations(currentUser.userId, { n, category });

	if (recommendedIds.length === 0) {
		return new Response(JSON.stringify(successResponse({ items: [] })), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 5. 查询当前用户的关注关系，用于可见度过滤
	const followingIds: string[] = [];
	const followerIds: string[] = [];
	const follows = await prisma.follow.findMany({
		where: { followerId: currentUser.userId },
		select: { followingId: true }
	});
	followingIds.push(...follows.map((f) => f.followingId));
	const followers = await prisma.follow.findMany({
		where: { followingId: currentUser.userId },
		select: { followerId: true }
	});
	followerIds.push(...followers.map((f) => f.followerId));

	const visibilityFilter = getVisibilityFilter(
		{ userId: currentUser.userId },
		{ followingIds, followerIds }
	);

	// 6. 从数据库查询推荐帖子的详细信息
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

	// 7. 逐条验证可见度（处理 password/users 等需要逐条验证的可见度类型）
	const visiblePosts = [];
	for (const post of posts) {
		const isVisible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			{ userId: currentUser.userId },
			{
				isFollower: followingIds.includes(post.userId),
				isFollowing: followerIds.includes(post.userId)
			}
		);
		if (isVisible) {
			visiblePosts.push(post);
		}
	}

	// 8. 按推荐顺序排列（Gorse 返回的顺序即推荐优先级）
	const orderedPosts = recommendedIds
		.map((id) => visiblePosts.find((p) => p.id === id))
		.filter(Boolean);

	// 9. 查询点赞状态
	const likedPostIds = await getLikedPostIds(
		currentUser.userId,
		orderedPosts.map((p) => p!.id)
	);

	// 10. 格式化返回数据
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

	return new Response(JSON.stringify(successResponse({ items })), {
		headers: { 'Content-Type': 'application/json' }
	});
};
