/**
 * 搜索 Service
 *
 * 编排用户搜索、搜索建议的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';

// ── 类型定义 ──

export interface SearchUsersInput {
	usernames: string[];
}

export interface SearchUsersResult {
	items: Array<{
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
	}>;
}

export interface SearchSuggestInput {
	query: string;
	limit?: number;
}

export interface SearchSuggestResult {
	tags: Array<{
		id: string;
		name: string;
		postCount: number;
	}>;
	users: Array<{
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
	}>;
	categories: Array<{
		id: string;
		name: string;
		slug: string;
		mode: string;
		icon: string;
		parentId: string | null;
	}>;
}

// ── 业务函数 ──

/**
 * 按用户名搜索用户
 *
 * 根据用户名列表查询匹配的用户（精确匹配）。
 * 用于 visibility=users 时查找指定用户 ID。
 * 排除被禁用的用户。
 *
 * @param input - { usernames: 用户名数组 }
 * @returns 用户列表
 */
export async function searchUsers(input: SearchUsersInput): Promise<SearchUsersResult> {
	const { usernames } = input;

	// 精确匹配用户名，排除被禁用的用户
	const users = await prisma.user.findMany({
		where: {
			username: { in: usernames },
			isDisabled: false
		},
		select: {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true
		}
	});

	return { items: users };
}

/**
 * 搜索建议
 *
 * 根据关键词前缀返回匹配的标签、用户和分类，用于搜索框自动补全。
 * 标签按帖子数降序排列，用户按粉丝数降序排列，分类按 mode 分组，每类最多 limit 条。
 *
 * @param input - { query: 搜索关键词, limit?: 每类最大返回条数（默认 5） }
 * @returns 标签、用户和分类的搜索建议
 */
export async function searchSuggest(input: SearchSuggestInput): Promise<SearchSuggestResult> {
	const { query, limit } = input;
	/** 每类返回的最大条数，默认 5 */
	const MAX_SUGGESTIONS = limit ?? 5;

	// 并行查询标签、用户和分类
	const [tags, users, categories] = await Promise.all([
		// 查询标签：名称包含关键词、未隐藏、按帖子数降序、最多 MAX_SUGGESTIONS 条
		prisma.tag.findMany({
			where: {
				name: { contains: query },
				isHidden: false
			},
			orderBy: { posts: { _count: 'desc' } },
			take: MAX_SUGGESTIONS,
			select: {
				id: true,
				name: true,
				_count: {
					select: { posts: true }
				}
			}
		}),
		// 查询用户：用户名或显示名包含关键词、未禁用、按粉丝数降序、最多 MAX_SUGGESTIONS 条
		prisma.user.findMany({
			where: {
				isDisabled: false,
				OR: [{ username: { contains: query } }, { displayName: { contains: query } }]
			},
			orderBy: { followers: { _count: 'desc' } },
			take: MAX_SUGGESTIONS,
			select: {
				id: true,
				username: true,
				displayName: true,
				avatarUrl: true
			}
		}),
		// 查询分类：名称包含关键词、按 mode 分组返回、最多 MAX_SUGGESTIONS 条
		prisma.category.findMany({
			where: {
				name: { contains: query }
			},
			orderBy: [{ mode: 'asc' }, { sortOrder: 'asc' }],
			take: MAX_SUGGESTIONS,
			select: {
				id: true,
				name: true,
				slug: true,
				mode: true,
				icon: true,
				parentId: true
			}
		})
	]);

	// 格式化标签数据：将 _count.posts 映射为 postCount
	const formattedTags = tags.map((tag) => ({
		id: tag.id,
		name: tag.name,
		postCount: tag._count.posts
	}));

	return { tags: formattedTags, users, categories };
}
