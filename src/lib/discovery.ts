/** 列表右栏可消费的真实发现入口。 */
import { prisma } from '@/lib/db';
import { getTrendingFeed } from '@/services/recommend.service';
import { getModeLabel } from '@/lib/config';

export interface DiscoveryItem {
	title: string;
	href: string;
	meta?: string;
}

/** 返回未隐藏标签，供微博、标签和搜索列表继续探索。 */
export async function getPopularTagItems(
	input: {
		excludeTagId?: string;
		limit?: number;
	} = {}
): Promise<DiscoveryItem[]> {
	const tags = await prisma.tag.findMany({
		where: {
			isHidden: false,
			...(input.excludeTagId ? { id: { not: input.excludeTagId } } : {})
		},
		orderBy: { posts: { _count: 'desc' } },
		take: input.limit ?? 5,
		include: { _count: { select: { posts: true } } }
	});

	return tags.map((tag) => ({
		title: `#${tag.name}`,
		href: `/tags/${encodeURIComponent(tag.name)}`,
		meta: `${tag._count.posts} ${getModeLabel(tag.mode)}`
	}));
}

/**
 * 返回中心列表之外的热门内容。可见度条件由页面沿用自身的权限契约传入，
 * 因而右栏不会泄漏主列表本不可见的内容。
 */
export async function getPopularPostItems(input: {
	mode: 'forum' | 'blog';
	viewerId?: string;
	excludePostIds: string[];
	categoryId?: string;
	limit?: number;
	responseLabel?: string;
}): Promise<DiscoveryItem[]> {
	const result = await getTrendingFeed({
		viewerId: input.viewerId,
		mode: input.mode,
		categoryId: input.categoryId,
		excludePostIds: input.excludePostIds,
		page: 1,
		pageSize: input.limit ?? 5
	});
	const posts = result.items;

	return posts.map((post) => ({
		title: post.title || post.content.replace(/\s+/g, ' ').slice(0, 32) || '未命名内容',
		href: `/${post.user.username}/${post.id}`,
		meta: `${post._count.comments} ${getModeLabel(input.mode)}${input.responseLabel ?? '评论'}`
	}));
}
