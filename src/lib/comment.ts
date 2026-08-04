/**
 * 评论数据库操作模块
 *
 * 提供评论的 CRUD 原子操作，供 Service 层调用。
 * 所有函数均为纯数据库操作，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

// ── 查询 ──

/**
 * 按 ID 查询评论（返回完整记录）
 *
 * @param id - 评论 ID
 * @returns 评论完整记录，不存在则返回 null
 */
export function findCommentById(id: string) {
	return prisma.comment.findUnique({ where: { id } });
}

/**
 * 按 ID 查询评论（指定 select 字段）
 *
 * @param id - 评论 ID
 * @param select - 需要查询的字段选择器
 * @returns 指定字段的评论记录，不存在则返回 null
 */
export function findCommentByIdSelect<T extends Prisma.CommentSelect>(id: string, select: T) {
	return prisma.comment.findUnique({ where: { id }, select });
}

/** 查询 Agent 帖子详情展示的一级评论及回复。 */
export function findAgentPostComments(postId: string, take?: number) {
	return prisma.comment.findMany({
		where: { postId, parentId: null, isDeleted: false },
		orderBy: { createdAt: 'desc' },
		...(take ? { take } : {}),
		include: {
			user: { select: { username: true, displayName: true } },
			replies: {
				where: { isDeleted: false },
				orderBy: { createdAt: 'desc' },
				include: { user: { select: { username: true, displayName: true } } }
			}
		}
	});
}

// ── 创建 ──

/**
 * 创建评论（支持 include）
 *
 * 使用 UncheckedCreateInput 允许直接传入 postId/userId 外键，
 * 而非通过关联字段创建。
 *
 * @param data - 评论创建数据（UncheckedCreateInput 格式）
 * @param include - 关联查询配置（可选）
 * @returns 创建的评论记录（包含 include 指定的关联字段）
 */
export function createCommentRecord<T extends Prisma.CommentInclude>(
	data: Prisma.CommentUncheckedCreateInput,
	include: T
) {
	return prisma.comment.create({
		data,
		include
	});
}

// ── 软删除 ──

/**
 * 软删除评论
 *
 * 将评论标记为 isDeleted = true。
 *
 * @param id - 评论 ID
 * @returns 更新后的评论记录
 */
export function softDeleteComment(id: string) {
	return prisma.comment.update({
		where: { id },
		data: { isDeleted: true }
	});
}

/**
 * 批量软删除评论
 *
 * @param ids - 评论 ID 列表
 * @returns 更新的记录数
 */
export function batchSoftDeleteComments(ids: string[]) {
	return prisma.comment.updateMany({
		where: { id: { in: ids } },
		data: { isDeleted: true }
	});
}
