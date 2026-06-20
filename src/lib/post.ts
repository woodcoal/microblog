/**
 * 帖子数据库操作模块
 *
 * 提供帖子的 CRUD 原子操作，供 Service 层调用。
 * 所有函数均为纯数据库操作，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

// ── 查询 ──

/**
 * 按 ID 查询帖子（返回完整记录）
 *
 * @param id - 帖子 ID
 * @returns 帖子完整记录，不存在则返回 null
 */
export function findPostById(id: string) {
	return prisma.post.findUnique({ where: { id } });
}

/**
 * 按 ID 查询帖子（指定 select 字段）
 *
 * @param id - 帖子 ID
 * @param select - 需要查询的字段选择器
 * @returns 指定字段的帖子记录，不存在则返回 null
 */
export function findPostByIdSelect<T extends Prisma.PostSelect>(id: string, select: T) {
	return prisma.post.findUnique({ where: { id }, select });
}

/**
 * 按 ID 列表查询帖子
 *
 * 支持 include 或 select 两种关联查询方式，二者互斥：
 * - 传入 include 时，返回包含关联数据的完整帖子记录
 * - 传入 select 时，仅返回指定字段（适用于只需要部分字段的场景）
 * - 都不传时，返回帖子全部标量字段
 *
 * @param ids - 帖子 ID 列表
 * @param where - 额外筛选条件（可选）
 * @param include - 关联查询配置（可选，与 select 互斥）
 * @param select - 字段选择器（可选，与 include 互斥）
 * @returns 匹配的帖子列表
 */
export function findPostsByIds(
	ids: string[],
	where?: Prisma.PostWhereInput,
	include?: Prisma.PostInclude,
	select?: Prisma.PostSelect
) {
	return prisma.post.findMany({
		where: { id: { in: ids }, ...where },
		...(include ? { include } : {}),
		...(select ? { select } : {})
	});
}

/**
 * 统计帖子数量
 *
 * @param where - 筛选条件
 * @returns 符合条件的帖子数量
 */
export function countPosts(where: Prisma.PostWhereInput) {
	return prisma.post.count({ where });
}

/**
 * 搜索帖子
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 需要查询的字段选择器（可选）
 * @returns 匹配的帖子列表
 */
export function searchPosts<T extends Prisma.PostSelect>(query: string, take: number, select?: T) {
	return prisma.post.findMany({
		where: { content: { contains: query } },
		take,
		...(select ? { select } : {})
	});
}

/**
 * 搜索帖子建议
 *
 * 按标题或内容模糊匹配搜索，用于搜索框自动补全。
 * 排除已删除的帖子，按创建时间降序排列。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 需要查询的字段选择器
 * @returns 匹配的帖子列表
 */
export function searchPostsSuggest<T extends Prisma.PostSelect>(
	query: string,
	take: number,
	select: T
) {
	return prisma.post.findMany({
		where: {
			isDeleted: false,
			OR: [{ title: { contains: query } }, { content: { contains: query } }]
		},
		orderBy: { createdAt: 'desc' },
		take,
		select
	});
}

// ── 更新 ──

/**
 * 更新帖子
 *
 * @param id - 帖子 ID
 * @param data - 更新数据
 * @returns 更新后的帖子记录
 */
export function updatePost(id: string, data: Prisma.PostUpdateInput) {
	return prisma.post.update({ where: { id }, data });
}

// ── 批量操作 ──

/**
 * 批量软删除帖子
 *
 * @param ids - 帖子 ID 列表
 * @param reason - 删除理由
 * @param operatorId - 操作者 ID
 * @returns 更新的记录数
 */
export function batchSoftDeletePosts(ids: string[], reason: string, operatorId: string) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isDeleted: true,
			deleteReason: reason,
			deletedBy: operatorId
		}
	});
}

/**
 * 批量锁定帖子
 *
 * @param ids - 帖子 ID 列表
 * @param reason - 锁定理由
 * @param operatorId - 操作者 ID
 * @returns 更新的记录数
 */
export function batchLockPosts(ids: string[], reason: string, operatorId: string) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isLocked: true,
			lockReason: reason,
			lockedBy: operatorId
		}
	});
}

/**
 * 批量解锁帖子
 *
 * @param ids - 帖子 ID 列表
 * @returns 更新的记录数
 */
export function batchUnlockPosts(ids: string[]) {
	return prisma.post.updateMany({
		where: { id: { in: ids } },
		data: {
			isLocked: false,
			lockReason: null,
			lockedBy: null
		}
	});
}

// ── 事务内操作 ──

/**
 * 统计用户置顶帖子数（事务内）
 *
 * @param tx - Prisma 事务客户端
 * @param userId - 用户 ID
 * @returns 用户已置顶且未删除的帖子数量
 */
export function countPinnedPosts(tx: Prisma.TransactionClient, userId: string) {
	return tx.post.count({
		where: {
			userId,
			isPinned: true,
			isDeleted: false
		}
	});
}

/**
 * 更新帖子置顶状态（事务内）
 *
 * @param tx - Prisma 事务客户端
 * @param id - 帖子 ID
 * @param pinned - 是否置顶
 * @returns 更新后的帖子记录
 */
export function updatePostPinStatus(tx: Prisma.TransactionClient, id: string, pinned: boolean) {
	return tx.post.update({
		where: { id },
		data: { isPinned: pinned }
	});
}

/**
 * 置顶切换事务
 *
 * 在事务内检查置顶数量上限后切换置顶状态，保证原子性。
 * 如果当前未置顶且已达上限，抛出 ServiceError。
 *
 * @param userId - 用户 ID
 * @param postId - 帖子 ID
 * @param currentPinned - 当前是否已置顶
 * @param maxPinned - 最大置顶数量
 * @returns 切换后的置顶状态
 */
export async function togglePostPinTransaction(
	userId: string,
	postId: string,
	currentPinned: boolean,
	maxPinned: number
): Promise<boolean> {
	const { ServiceError } = await import('@/lib/errors');

	return prisma.$transaction(async (tx) => {
		// 如果要置顶（当前未置顶），检查用户已置顶数量是否达上限
		if (!currentPinned) {
			const pinnedCount = await countPinnedPosts(tx, userId);
			if (pinnedCount >= maxPinned) {
				throw new ServiceError('BAD_REQUEST', '置顶数量已达上限');
			}
		}

		// 切换置顶状态
		const pinned = !currentPinned;
		await updatePostPinStatus(tx, postId, pinned);
		return pinned;
	});
}
