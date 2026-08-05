/**
 * 搜索 Service
 *
 * 编排用户搜索、搜索建议的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { searchUsersByUsernames, searchUsers as searchUsersFromLib } from '@/lib/user';
import { searchTags } from '@/lib/tag';
import { searchPostsSuggest } from '@/lib/post';
import { searchCategories } from '@/lib/category';

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
	posts: Array<{
		id: string;
		title: string;
		content: string;
		mode: string;
		createdAt: string;
		user: {
			id: string;
			username: string;
			displayName: string;
			avatarUrl: string | null;
		};
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
	const users = await searchUsersByUsernames(usernames, {
		id: true,
		username: true,
		displayName: true,
		avatarUrl: true
	});

	return { items: users };
}

/**
 * 搜索建议
 *
 * 根据关键词前缀返回匹配的标签、帖子、用户和分类，用于搜索框自动补全。
 * 标签按帖子数降序排列，帖子按创建时间降序，用户按粉丝数降序排列，分类按 mode 分组，每类最多 limit 条。
 *
 * @param input - { query: 搜索关键词, limit?: 每类最大返回条数（默认 5） }
 * @returns 标签、帖子、用户和分类的搜索建议
 */
export async function searchSuggest(input: SearchSuggestInput): Promise<SearchSuggestResult> {
	const { query, limit } = input;
	/** 每类返回的最大条数，默认 5 */
	const MAX_SUGGESTIONS = limit ?? 5;

	// 并行查询标签、帖子、用户和分类
	const [tags, posts, users, categories] = await Promise.all([
		// 查询标签：名称包含关键词、未隐藏、按帖子数降序、最多 MAX_SUGGESTIONS 条
		searchTags(
			query,
			MAX_SUGGESTIONS,
			{
				id: true,
				name: true,
				_count: {
					select: { posts: true }
				}
			},
			{ isHidden: false },
			{ posts: { _count: 'desc' } }
		),
		// 查询帖子：标题或内容包含关键词、未删除、按创建时间降序、最多 3 条
		searchPostsSuggest(query, 3, {
			id: true,
			title: true,
			content: true,
			mode: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}
		}),
		// 查询用户：用户名或显示名包含关键词、未禁用、按粉丝数降序、最多 MAX_SUGGESTIONS 条
		searchUsersFromLib(query, MAX_SUGGESTIONS, {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true
		}),
		// 查询分类：名称包含关键词、按 mode 分组返回、最多 MAX_SUGGESTIONS 条
		searchCategories(
			query,
			MAX_SUGGESTIONS,
			{
				id: true,
				name: true,
				slug: true,
				mode: true,
				icon: true,
				parentId: true
			},
			[{ mode: 'asc' }, { sortOrder: 'asc' }]
		)
	]);

	// 格式化标签数据：将 _count.posts 映射为 postCount
	const formattedTags = (
		tags as Array<{ id: string; name: string; _count?: { posts: number } }>
	).map((tag) => ({
		id: tag.id,
		name: tag.name,
		postCount: tag._count?.posts ?? 0
	}));

	// 格式化帖子数据：将 content 截取前 100 字符，createdAt 转为 ISO 字符串
	const formattedPosts = posts.map((post) => ({
		id: post.id,
		title: post.title ?? '',
		content: post.content.slice(0, 100),
		mode: post.mode,
		createdAt: post.createdAt.toISOString(),
		user: post.user
	}));

	return { tags: formattedTags, posts: formattedPosts, users, categories };
}
