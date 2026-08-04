/**
 * 分类管理 Actions
 *
 * 提供分类的创建、更新、删除和排序功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	createCategory as createCategoryService,
	updateCategory as updateCategoryService,
	deleteCategory as deleteCategoryService,
	reorderCategories as reorderCategoriesService
} from '@/services/category.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 创建分类 Action
 *
 * 管理员创建新的分类（一级分组或二级分类）。
 *
 * @param input - 分类创建参数
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

		try {
			return await createCategoryService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 更新分类 Action
 *
 * 管理员更新分类的指定字段。
 *
 * @param input - 分类更新参数
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

		try {
			return await updateCategoryService(input);
		} catch (e) {
			handleServiceError(e);
		}
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

		try {
			return await deleteCategoryService(input);
		} catch (e) {
			handleServiceError(e);
		}
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

		try {
			return await reorderCategoriesService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});
