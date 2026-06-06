/**
 * 相似帖子推荐 API
 *
 * 根据指定帖子的内容特征，返回 Gorse 推荐引擎计算的相似帖子列表。
 * 不需要登录。Gorse 未配置时返回空列表。
 * 返回的帖子经过可见度过滤。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { getSimilarItems, isGorseEnabled } from '@/lib/gorse';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { getUserFromRequest } from '@/lib/auth';
import { POST_CARD_INCLUDE, getLikedPostIds } from '@/lib/queries';
import { successResponse } from '@/lib/utils';

export const GET: APIRoute = async ({ params, request, url }) => {
	const { id } = params;

	if (!id) {
		return new Response(
			JSON.stringify({ success: false, error: { message: '帖子 ID 不能为空', status: 400 } }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Gorse 未启用时返回空列表
	if (!isGorseEnabled()) {
		return new Response(JSON.stringify(successResponse({ items: [] })), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 从查询参数获取返回数量
	const n = Math.min(Math.max(parseInt(url.searchParams.get('n') || '5', 10), 1), 20);

	// 从 Gorse 获取相似帖子 ID
	const similarIds = await getSimilarItems(id, { n });

	if (similarIds.length === 0) {
		return new Response(JSON.stringify(successResponse({ items: [] })), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 获取当前用户（可选，用于可见度过滤和点赞状态）
	const currentUser = await getUserFromRequest({ request } as any);

	// 构建可见度过滤条件
	const followingIds: string[] = [];
	const followerIds: string[] = [];
	if (currentUser) {
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
	}

	const visibilityFilter = getVisibilityFilter(
		currentUser ? { userId: currentUser.userId } : null,
		{ followingIds, followerIds }
	);

	// 查询帖子详情
	const posts = await prisma.post.findMany({
		where: {
			id: { in: similarIds },
			isDeleted: false,
			...visibilityFilter
		},
		include: {
			...POST_CARD_INCLUDE,
			likes: { select: { id: true, userId: true } },
			comments: { select: { id: true } }
		}
	});

	// 逐条验证可见度
	const visiblePosts = [];
	for (const post of posts) {
		const isVisible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				passwordHash: post.passwordHash,
				allowedUserIds: post.allowedUserIds
			},
			currentUser ? { userId: currentUser.userId } : null,
			{
				isFollower: followingIds.includes(post.userId),
				isFollowing: followerIds.includes(post.userId)
			}
		);
		if (isVisible) {
			visiblePosts.push(post);
		}
	}

	// 按相似度顺序排列
	const orderedPosts = similarIds
		.map((sid) => visiblePosts.find((p) => p.id === sid))
		.filter(Boolean);

	// 查询点赞状态
	const likedPostIds = await getLikedPostIds(
		currentUser?.userId ?? null,
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

	return new Response(JSON.stringify(successResponse({ items })), {
		headers: { 'Content-Type': 'application/json' }
	});
};
