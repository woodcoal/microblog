/**
 * 分类管理 Service
 *
 * 编排分类的创建、更新、删除和排序业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import {
	findCategoryBySlug,
	findCategoryById,
	createCategory as createCategoryRecord,
	updateCategory as updateCategoryRecord,
	deleteCategoryById,
	countPostsByCategory,
	countChildCategories,
	reorderCategories as reorderCategoriesRecords
} from '@/lib/category';
import { ServiceError } from '@/lib/errors';

/** 合法的分类模式列表 */
const VALID_MODES = ['weibo', 'forum', 'blog'] as const;

// ── 类型定义 ──

export interface CreateCategoryInput {
	name: string;
	slug: string;
	mode?: string;
	parentId?: string;
	description?: string;
	icon?: string;
	sortOrder?: number;
}

export interface CategoryResult {
	id: string;
	name: string;
	slug: string;
	mode: string;
	parentId: string | null;
	description: string;
	icon: string;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export interface UpdateCategoryInput {
	id: string;
	name?: string;
	slug?: string;
	parentId?: string | null;
	description?: string;
	icon?: string;
	sortOrder?: number;
}

export interface DeleteCategoryInput {
	id: string;
}

export interface ReorderCategoriesInput {
	items: Array<{ id: string; sortOrder: number }>;
}

// ── 业务函数 ──

/**
 * 创建分类
 *
 * 校验 mode 合法性、slug 唯一性、父分类存在性。
 * 创建新的分类（一级分组或二级分类）。
 *
 * @param input - 分类创建参数
 * @returns 创建的分类数据
 */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryResult> {
	const { name, slug, mode, parentId, description, icon, sortOrder } = input;

	// 校验 slug 唯一
	const existing = await findCategoryBySlug(slug);
	if (existing) {
		throw new ServiceError('BAD_REQUEST', 'slug 已存在');
	}

	// 如果有 parentId，校验父分类存在
	let effectiveMode = mode;
	if (parentId) {
		const parent = await findCategoryById(parentId);
		if (!parent) {
			throw new ServiceError('NOT_FOUND', '父分类不存在');
		}
		// 父分类必须是一级分组（没有自己的 parentId）
		if (parent.parentId) {
			throw new ServiceError('BAD_REQUEST', '不支持三级分类');
		}
		// 二级分类必须继承父分类模式，不信任客户端传入的 mode。
		effectiveMode = parent.mode;
	}

	if (!effectiveMode || !VALID_MODES.includes(effectiveMode as (typeof VALID_MODES)[number])) {
		throw new ServiceError('BAD_REQUEST', `无效的模式，仅支持: ${VALID_MODES.join(', ')}`);
	}

	// 创建分类
	const category = await createCategoryRecord({
		name: name.trim(),
		slug: slug.trim(),
		mode: effectiveMode,
		parentId: parentId || null,
		description: description || '',
		icon: icon || '',
		sortOrder: sortOrder ?? 0
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

/**
 * 更新分类
 *
 * 校验分类存在、slug 唯一性，更新指定字段。
 *
 * @param input - 分类更新参数
 * @returns 更新后的分类数据
 */
export async function updateCategory(input: UpdateCategoryInput): Promise<CategoryResult> {
	const { id, name, slug, parentId, description, icon, sortOrder } = input;

	// 查询分类是否存在
	const category = await findCategoryById(id);
	if (!category) {
		throw new ServiceError('NOT_FOUND', '分类不存在');
	}

	// 如果更新 slug，校验唯一性
	if (slug && slug !== category.slug) {
		const existing = await findCategoryBySlug(slug);
		if (existing) {
			throw new ServiceError('BAD_REQUEST', 'slug 已存在');
		}
	}
	let inheritedMode: string | undefined;
	if (parentId !== undefined && parentId !== null) {
		if (parentId === id) {
			throw new ServiceError('BAD_REQUEST', '分类不能设为自身的父分类');
		}
		const childCount = await countChildCategories(id);
		if (childCount > 0) {
			throw new ServiceError('BAD_REQUEST', '包含子分类的分类不能设为二级分类');
		}
		const parent = await findCategoryById(parentId);
		if (!parent) {
			throw new ServiceError('NOT_FOUND', '父分类不存在');
		}
		if (parent.parentId) {
			throw new ServiceError('BAD_REQUEST', '不支持三级分类');
		}
		inheritedMode = parent.mode;
	}

	// 构建更新数据
	const updateData: Record<string, unknown> = {};
	if (name !== undefined) updateData.name = name.trim();
	if (slug !== undefined) updateData.slug = slug.trim();
	if (parentId !== undefined) updateData.parentId = parentId;
	if (inheritedMode !== undefined) updateData.mode = inheritedMode;
	if (description !== undefined) updateData.description = description;
	if (icon !== undefined) updateData.icon = icon;
	if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

	// 没有需要更新的字段
	if (Object.keys(updateData).length === 0) {
		throw new ServiceError('BAD_REQUEST', '没有需要更新的字段');
	}

	// 执行更新
	const updated = await updateCategoryRecord(id, updateData);

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

/**
 * 删除分类
 *
 * 有关联帖子或子分类时拒绝删除。
 *
 * @param input - { id: 分类ID }
 * @returns 被删除的分类 ID
 */
export async function deleteCategory(input: DeleteCategoryInput): Promise<{ id: string }> {
	const { id } = input;

	// 查询分类是否存在
	const category = await findCategoryById(id);
	if (!category) {
		throw new ServiceError('NOT_FOUND', '分类不存在');
	}

	// 检查是否有关联帖子
	const postCount = await countPostsByCategory(id);
	if (postCount > 0) {
		throw new ServiceError('BAD_REQUEST', `该分类下有 ${postCount} 篇帖子，无法删除`);
	}

	// 检查是否有子分类
	const childCount = await countChildCategories(id);
	if (childCount > 0) {
		throw new ServiceError('BAD_REQUEST', `该分类下有 ${childCount} 个子分类，无法删除`);
	}

	// 删除分类
	await deleteCategoryById(id);

	return { id };
}

/**
 * 批量重排分类排序
 *
 * 批量更新分类的排序权重。
 *
 * @param input - { items: [{ id, sortOrder }] }
 * @returns 更新结果
 */
export async function reorderCategories(
	input: ReorderCategoriesInput
): Promise<{ updated: number }> {
	const { items } = input;

	// 批量更新排序
	await reorderCategoriesRecords(items);

	return { updated: items.length };
}
