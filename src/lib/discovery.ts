/** 列表右栏可消费的真实发现入口。 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

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
		meta: `${tag._count.posts} 条动态`
	}));
}

/**
 * 返回中心列表之外的热门内容。可见度条件由页面沿用自身的权限契约传入，
 * 因而右栏不会泄漏主列表本不可见的内容。
 */
export async function getPopularPostItems(input: {
	mode: 'forum' | 'blog';
	visibilityFilter: Prisma.PostWhereInput;
	excludePostIds: string[];
	categoryId?: string;
	limit?: number;
	responseLabel?: string;
}): Promise<DiscoveryItem[]> {
	const findItems = (excludeCurrent: boolean) =>
		prisma.post.findMany({
			where: {
				isDeleted: false,
				mode: input.mode,
				...(input.categoryId ? { categoryId: input.categoryId } : {}),
				...(excludeCurrent && input.excludePostIds.length > 0
					? { id: { notIn: input.excludePostIds } }
					: {}),
				...input.visibilityFilter
			},
			orderBy: [
				{ likes: { _count: 'desc' } },
				{ comments: { _count: 'desc' } },
				{ createdAt: 'desc' }
			],
			take: input.limit ?? 5,
			select: {
				id: true,
				title: true,
				content: true,
				user: { select: { username: true } },
				_count: { select: { comments: true } }
			}
		});

	let posts = await findItems(true);
	// 分页首屏覆盖全部候选时，回退到中心列表的热门项，避免原本完整的
	// 三栏频道在有效内容存在时退化为空侧栏。
	if (posts.length === 0 && input.excludePostIds.length > 0) {
		posts = await findItems(false);
	}

	return posts.map((post) => ({
		title: post.title || post.content.replace(/\s+/g, ' ').slice(0, 32) || '未命名内容',
		href: `/${post.user.username}/${post.id}`,
		meta: `${post._count.comments} 条${input.responseLabel ?? '评论'}`
	}));
}
