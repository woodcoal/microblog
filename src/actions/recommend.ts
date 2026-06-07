/**
 * 推荐系统相关 Actions
 *
 * 定义个性化推荐和浏览记录等服务端 Actions。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
	isGorseEnabled,
	getRecommendations as gorseGetRecommend,
	insertFeedback,
	FEEDBACK_TYPE_READ
} from '@/lib/gorse';
import { getVisibilityFilter, checkPostVisibility } from '@/lib/visibility';
import { POST_CARD_INCLUDE, getLikedPostIds } from '@/lib/queries';

/**
 * 获取个性化推荐 Action
 *
 * 根据用户历史行为，返回 Gorse 推荐引擎生成的个性化帖子列表。
 * 需要登录认证。Gorse 未配置时返回空列表。
 * 返回的帖子经过可见度过滤，确保用户只能看到有权限的内容。
 *
 * @param input - { n?: 返回数量，默认 5 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { items: [...] } 推荐帖子列表
 */
const getRecommend = defineAction({
	input: z.object({
		n: z.number().int().min(1).max(50).optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		// 2. Gorse 未启用时返回空列表
		if (!isGorseEnabled()) {
			return { items: [] };
		}

		const n = input.n ?? 5;

		// 3. 从 Gorse 获取推荐帖子 ID
		const recommendedIds = await gorseGetRecommend(currentUser.userId, { n });

		if (recommendedIds.length === 0) {
			return { items: [] };
		}

		// 4. 查询当前用户的关注关系，用于可见度过滤
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

		// 5. 从数据库查询推荐帖子的详细信息
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

		// 6. 逐条验证可见度（处理 password/users 等需要逐条验证的可见度类型）
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

		// 7. 按推荐顺序排列（Gorse 返回的顺序即推荐优先级）
		const orderedPosts = recommendedIds
			.map((id) => visiblePosts.find((p) => p.id === id))
			.filter(Boolean);

		// 8. 查询点赞状态
		const likedPostIds = await getLikedPostIds(
			currentUser.userId,
			orderedPosts.map((p) => p!.id)
		);

		// 9. 格式化返回数据
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
});

/**
 * 记录浏览行为 Action
 *
 * 将用户浏览帖子的行为异步记录到 Gorse 推荐引擎。
 * 浏览反馈（read）用于去重：已看过的帖子不再推荐。
 * 需要登录认证。Gorse 未配置时静默返回成功。
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { recorded: true } 记录成功
 */
const recordRead = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		// 2. Gorse 未启用时静默返回成功
		if (!isGorseEnabled()) {
			return { recorded: true };
		}

		const { postId } = input;

		// 3. 异步插入浏览反馈（不等待结果，直接返回成功）
		insertFeedback(
			currentUser.userId,
			postId,
			FEEDBACK_TYPE_READ,
			new Date().toISOString()
		).catch(() => {});

		return { recorded: true };
	}
});

export { getRecommend, recordRead };
