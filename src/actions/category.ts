/**
 * 分类管理 Actions
 *
 * 提供分类的创建、更新、删除和排序功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** 合法的分类模式列表 */
const VALID_MODES = ['weibo', 'forum', 'blog'] as const;

/**
 * 创建分类 Action
 *
 * 管理员创建新的分类（一级分组或二级分类）。
 * 校验 mode 合法性、slug 唯一性、父分类存在性。
 *
 * @param input - { name: 分类名称, slug: URL标识, mode: 模式, parentId?: 父分类ID, description?: 描述, icon?: 图标, sortOrder?: 排序 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 创建的分类数据
 */
export const createCategory = defineAction({
	input: z.object({
		name: z.string().min(1, '分类名称不能为空'),
		slug: z.string().min(1, 'slug 不能为空'),
		mode: z.string().min(1, '模式不能为空'),
		parentId: z.string().optional(),
		description: z.string().optional(),
		icon: z.string().optional(),
		sortOrder: z.number().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { name, slug, mode, parentId, description, icon, sortOrder } = input;

		// 校验 mode 必须是合法值
		if (!VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `无效的模式，仅支持: ${VALID_MODES.join(', ')}`
			});
		}

		// 校验 slug 唯一
		const existing = await prisma.category.findUnique({ where: { slug } });
		if (existing) {
			throw new ActionError({ code: 'BAD_REQUEST', message: 'slug 已存在' });
		}

		// 如果有 parentId，校验父分类存在
		if (parentId) {
			const parent = await prisma.category.findUnique({ where: { id: parentId } });
			if (!parent) {
				throw new ActionError({ code: 'NOT_FOUND', message: '父分类不存在' });
			}
			// 父分类必须是一级分组（没有自己的 parentId）
			if (parent.parentId) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '不支持三级分类' });
			}
		}

		// 创建分类
		const category = await prisma.category.create({
			data: {
				name: name.trim(),
				slug: slug.trim(),
				mode,
				parentId: parentId || null,
				description: description || '',
				icon: icon || '',
				sortOrder: sortOrder ?? 0
			}
		});

		return {
			id: category.id,
			name: category.name,
			slug: category.slug,
			mode: category.mode,
			parentId: category.parentId,
			description: category.description,
			icon: category.icon,
			sortOrder: category.sortOrder,
			createdAt: category.createdAt.toISOString(),
			updatedAt: category.updatedAt.toISOString()
		};
	}
});

/**
 * 更新分类 Action
 *
 * 管理员更新分类的指定字段（名称、slug、描述、图标、排序）。
 *
 * @param input - { id: 分类ID, name?: 名称, slug?: URL标识, description?: 描述, icon?: 图标, sortOrder?: 排序 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的分类数据
 */
export const updateCategory = defineAction({
	input: z.object({
		id: z.string().min(1, '分类 ID 不能为空'),
		name: z.string().optional(),
		slug: z.string().optional(),
		description: z.string().optional(),
		icon: z.string().optional(),
		sortOrder: z.number().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { id, name, slug, description, icon, sortOrder } = input;

		// 查询分类是否存在
		const category = await prisma.category.findUnique({ where: { id } });
		if (!category) {
			throw new ActionError({ code: 'NOT_FOUND', message: '分类不存在' });
		}

		// 如果更新 slug，校验唯一性
		if (slug && slug !== category.slug) {
			const existing = await prisma.category.findUnique({ where: { slug } });
			if (existing) {
				throw new ActionError({ code: 'BAD_REQUEST', message: 'slug 已存在' });
			}
		}

		// 构建更新数据
		const updateData: Record<string, unknown> = {};
		if (name !== undefined) updateData.name = name.trim();
		if (slug !== undefined) updateData.slug = slug.trim();
		if (description !== undefined) updateData.description = description;
		if (icon !== undefined) updateData.icon = icon;
		if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

		// 没有需要更新的字段
		if (Object.keys(updateData).length === 0) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '没有需要更新的字段' });
		}

		// 执行更新
		const updated = await prisma.category.update({
			where: { id },
			data: updateData
		});

		return {
			id: updated.id,
			name: updated.name,
			slug: updated.slug,
			mode: updated.mode,
			parentId: updated.parentId,
			description: updated.description,
			icon: updated.icon,
			sortOrder: updated.sortOrder,
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString()
		};
	}
});

/**
 * 删除分类 Action
 *
 * 管理员删除分类。有关联帖子或子分类时拒绝删除。
 *
 * @param input - { id: 分类ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 被删除的分类 ID
 */
export const deleteCategory = defineAction({
	input: z.object({
		id: z.string().min(1, '分类 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { id } = input;

		// 查询分类是否存在
		const category = await prisma.category.findUnique({ where: { id } });
		if (!category) {
			throw new ActionError({ code: 'NOT_FOUND', message: '分类不存在' });
		}

		// 检查是否有关联帖子
		const postCount = await prisma.post.count({ where: { categoryId: id } });
		if (postCount > 0) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `该分类下有 ${postCount} 篇帖子，无法删除`
			});
		}

		// 检查是否有子分类
		const childCount = await prisma.category.count({ where: { parentId: id } });
		if (childCount > 0) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `该分类下有 ${childCount} 个子分类，无法删除`
			});
		}

		// 删除分类
		await prisma.category.delete({ where: { id } });

		return { id };
	}
});

/**
 * 批量重排分类排序 Action
 *
 * 管理员批量更新分类的排序权重。
 *
 * @param input - { items: [{ id: 分类ID, sortOrder: 排序权重 }] }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新结果
 */
export const reorderCategories = defineAction({
	input: z.object({
		items: z
			.array(
				z.object({
					id: z.string().min(1),
					sortOrder: z.number()
				})
			)
			.min(1, '至少需要一个排序项')
	}),
	handler: async (input, context) => {
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { items } = input;

		// 批量更新排序
		await prisma.$transaction(
			items.map((item) =>
				prisma.category.update({
					where: { id: item.id },
					data: { sortOrder: item.sortOrder }
				})
			)
		);

		return { updated: items.length };
	}
});
