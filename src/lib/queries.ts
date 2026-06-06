/**
 * 共享查询工具模块
 *
 * 提取帖子列表页面中重复的 Prisma include 配置和点赞/收藏状态查询逻辑，
 * 减少代码重复，统一维护查询结构。
 */
import { prisma } from './db';

/**
 * 帖子卡片列表的 Prisma include 配置
 *
 * 包含用户信息、媒体、标签和计数统计，
 * 用于首页、最新、关注时间线、用户主页等帖子列表查询。
 * 需要额外字段的页面可在此基础上映射扩展。
 */
export const POST_CARD_INCLUDE = {
	user: {
		select: {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true
		}
	},
	media: {
		include: {
			fileStorage: {
				select: {
					id: true,
					filePath: true,
					fileSize: true,
					mimeType: true,
					fileType: true
				}
			}
		}
	},
	tags: {
		include: {
			tag: {
				select: {
					id: true,
					name: true
				}
			}
		}
	},
	_count: {
		select: { likes: true, comments: true }
	}
} as const;

/**
 * 查询用户对指定帖子的点赞状态
 *
 * 根据用户 ID 和帖子 ID 列表，查询该用户已点赞的帖子 ID 集合。
 * 未登录时返回空 Set。
 *
 * @param userId - 当前用户 ID，未登录时为 null
 * @param postIds - 需要查询的帖子 ID 列表
 * @returns 已点赞的帖子 ID 集合
 */
export async function getLikedPostIds(
	userId: string | null,
	postIds: string[]
): Promise<Set<string>> {
	if (!userId || postIds.length === 0) {
		return new Set();
	}

	const likes = await prisma.like.findMany({
		where: {
			userId,
			postId: { in: postIds }
		},
		select: { postId: true }
	});

	return new Set(likes.map((l) => l.postId).filter((id): id is string => id !== null));
}

/**
 * 查询用户对指定帖子的收藏状态
 *
 * 根据用户 ID 和帖子 ID 列表，查询该用户已收藏的帖子 ID 集合。
 * 未登录时返回空 Set。
 *
 * @param userId - 当前用户 ID，未登录时为 null
 * @param postIds - 需要查询的帖子 ID 列表
 * @returns 已收藏的帖子 ID 集合
 */
export async function getBookmarkedPostIds(
	userId: string | null,
	postIds: string[]
): Promise<Set<string>> {
	if (!userId || postIds.length === 0) {
		return new Set();
	}

	const bookmarks = await prisma.bookmark.findMany({
		where: {
			userId,
			postId: { in: postIds }
		},
		select: { postId: true }
	});

	return new Set(bookmarks.map((b) => b.postId));
}
