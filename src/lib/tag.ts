/**
 * 标签数据库操作模块
 *
 * 提供标签的 CRUD 原子操作，供 Service 层调用。
 * 所有函数均为纯数据库操作，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/**
 * 按 ID 查询标签
 *
 * @param id - 标签 ID
 * @returns 标签记录，不存在则返回 null
 */
export async function findTagById(id: string) {
	return prisma.tag.findUnique({ where: { id } });
}

/**
 * 更新标签显示状态
 *
 * @param id - 标签 ID
 * @param isHidden - 是否隐藏
 * @returns 更新后的标签记录
 */
export async function updateTagVisibility(id: string, isHidden: boolean) {
	return prisma.tag.update({
		where: { id },
		data: { isHidden }
	});
}

/**
 * 搜索标签
 *
 * 按标签名称模糊匹配搜索，支持额外筛选条件和排序。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @param where - 可选，额外筛选条件（与名称匹配条件合并）
 * @param orderBy - 可选，排序条件
 * @returns 匹配的标签列表
 */
export async function searchTags<T extends Prisma.TagSelect>(
	query: string,
	take: number,
	select?: T,
	where?: Prisma.TagWhereInput,
	orderBy?: Prisma.TagOrderByWithRelationInput
) {
	return prisma.tag.findMany({
		where: { name: { contains: query }, ...where },
		...(orderBy ? { orderBy } : {}),
		take,
		...(select ? { select } : {})
	});
}

/**
 * 按名称查询标签
 *
 * @param name - 标签名称
 * @returns 标签记录，不存在则返回 null
 */
export function findTagByName(name: string) {
	return prisma.tag.findUnique({ where: { name } });
}

/**
 * 查询标签关联的帖子 ID 列表
 *
 * @param tagId - 标签 ID
 * @returns 关联的帖子 ID 数组
 */
export async function findPostIdsByTagId(tagId: string): Promise<string[]> {
	const postTags = await prisma.postTag.findMany({
		where: { tagId },
		select: { postId: true }
	});
	return postTags.map((pt) => pt.postId);
}
