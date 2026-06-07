/**
 * 搜索功能 Actions
 *
 * 提供用户搜索和建议功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * 按用户名搜索用户 Action
 *
 * 根据逗号分隔的用户名列表查询匹配的用户（精确匹配）。
 * 用于 visibility=users 时查找指定用户 ID。
 * 需要登录认证。
 *
 * @param input - { usernames: 用户名数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 用户列表（id、username、displayName、avatarUrl）
 */
export const searchUsers = defineAction({
	input: z.object({
		usernames: z.array(z.string().min(1)).min(1, '至少输入一个用户名')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { usernames } = input;

		// 2. 精确匹配用户名，排除被禁用的用户
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
});

/**
 * 搜索建议 Action
 *
 * 根据关键词前缀返回匹配的标签、用户和分类，用于搜索框自动补全。
 * 标签按帖子数降序排列，用户按粉丝数降序排列，分类按 mode 分组，每类最多 limit 条。
 * 不需要认证。
 *
 * @param input - { query: 搜索关键词, limit?: 每类最大返回条数（默认 5） }
 * @returns 标签、用户和分类的搜索建议
 */
export const searchSuggest = defineAction({
	input: z.object({
		query: z.string().min(1, '搜索关键词不能为空'),
		limit: z.number().int().min(1).max(20).optional()
	}),
	handler: async (input) => {
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
});
