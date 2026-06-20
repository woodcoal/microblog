/**
 * 分类数据库操作模块
 *
 * 提供分类的 CRUD 原子操作，供 Service 层调用。
 * 所有 Prisma 直接调用均收敛于此模块，
 * Service 层仅通过本模块函数访问分类相关数据。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/**
 * 按 slug 查询分类
 *
 * 根据分类的唯一 slug 标识查找分类记录。
 *
 * @param slug - 分类的 slug 标识
 * @returns 匹配的分类记录，未找到时返回 null
 */
export async function findCategoryBySlug(slug: string) {
	return prisma.category.findUnique({ where: { slug } });
}

/**
 * 按 ID 查询分类
 *
 * 根据分类的唯一 ID 查找分类记录。
 *
 * @param id - 分类的唯一标识
 * @returns 匹配的分类记录，未找到时返回 null
 */
export async function findCategoryById(id: string) {
	return prisma.category.findUnique({ where: { id } });
}

/**
 * 创建分类
 *
 * 向数据库插入一条新的分类记录。
 *
 * @param data - 分类创建数据（name, slug, mode, parentId, description, icon, sortOrder）
 * @returns 创建成功的分类记录
 */
export async function createCategory(data: {
	name: string;
	slug: string;
	mode: string;
	parentId: string | null;
	description: string;
	icon: string;
	sortOrder: number;
}) {
	return prisma.category.create({ data });
}

/**
 * 更新分类
 *
 * 根据分类 ID 更新指定字段。
 *
 * @param id - 分类唯一标识
 * @param data - 需要更新的字段键值对
 * @returns 更新后的分类记录
 */
export async function updateCategory(id: string, data: Record<string, unknown>) {
	return prisma.category.update({ where: { id }, data });
}

/**
 * 删除分类
 *
 * 根据分类 ID 删除对应的分类记录。
 *
 * @param id - 分类唯一标识
 * @returns 被删除的分类记录
 */
export async function deleteCategoryById(id: string) {
	return prisma.category.delete({ where: { id } });
}

/**
 * 统计分类下的帖子数量
 *
 * 查询指定分类下关联的帖子总数，
 * 用于删除前校验是否存在关联帖子。
 *
 * @param categoryId - 分类唯一标识
 * @returns 该分类下的帖子数量
 */
export async function countPostsByCategory(categoryId: string) {
	return prisma.post.count({ where: { categoryId } });
}

/**
 * 统计子分类数量
 *
 * 查询指定分类下的直接子分类数量，
 * 用于删除前校验是否存在子分类。
 *
 * @param parentId - 父分类唯一标识
 * @returns 该分类下的子分类数量
 */
export async function countChildCategories(parentId: string) {
	return prisma.category.count({ where: { parentId } });
}

/**
 * 批量重排分类排序（事务）
 *
 * 在一个数据库事务中批量更新多个分类的 sortOrder 字段，
 * 保证排序更新的原子性。
 *
 * @param items - 需要重排的分类列表，每项包含 id 和 sortOrder
 * @returns 事务执行结果
 */
export async function reorderCategories(items: Array<{ id: string; sortOrder: number }>) {
	return prisma.$transaction(
		items.map((item) =>
			prisma.category.update({
				where: { id: item.id },
				data: { sortOrder: item.sortOrder }
			})
		)
	);
}

/**
 * 搜索分类
 *
 * 根据关键词模糊搜索分类名称，支持排序和字段选择。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 可选的字段选择器，控制返回字段
 * @param orderBy - 可选的排序条件
 * @returns 匹配的分类记录列表
 */
export async function searchCategories<T extends Prisma.CategorySelect>(
	query: string,
	take: number,
	select?: T,
	orderBy?: Prisma.CategoryOrderByWithRelationInput | Prisma.CategoryOrderByWithRelationInput[]
) {
	return prisma.category.findMany({
		where: { name: { contains: query } },
		...(orderBy ? { orderBy } : {}),
		take,
		...(select ? { select } : {})
	});
}
