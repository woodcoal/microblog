/**
 * 管理后台批量操作 Actions
 *
 * 定义管理员对用户、帖子、评论的批量操作服务端 Actions。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

/**
 * 用户批量操作 Action
 *
 * 管理员批量禁用或启用用户。
 * 禁用操作会跳过 admin 角色用户，防止误操作。
 *
 * @param input - { action: 'disable' | 'enable', ids: 用户ID数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { affected: number } 受影响的用户数量
 */
const batchUsers = defineAction({
	input: z.object({
		action: z.enum(['disable', 'enable']),
		ids: z.array(z.string().min(1)).min(1, 'ids 必须是非空数组')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { action, ids } = input;

		// 2. 验证 ids 数量上限
		if (ids.length > MAX_BATCH_SIZE) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `单次最多操作 ${MAX_BATCH_SIZE} 条`
			});
		}

		let result: { count: number };

		if (action === 'disable') {
			// 禁用用户，排除 admin 角色防止误操作
			result = await prisma.user.updateMany({
				where: {
					id: { in: ids },
					role: { not: 'admin' }
				},
				data: { isDisabled: true }
			});
		} else {
			// 启用用户，无角色限制
			result = await prisma.user.updateMany({
				where: { id: { in: ids } },
				data: { isDisabled: false }
			});
		}

		return { affected: result.count };
	}
});

/**
 * 帖子批量操作 Action
 *
 * 管理员批量删除、锁定或解锁帖子。
 * 删除和锁定操作需填写理由。
 * 删除为软删除，锁定设置锁定信息，解锁清除锁定状态。
 *
 * @param input - { action: 'delete' | 'lock' | 'unlock', ids: 帖子ID数组, reason?: 理由 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { affected: number } 受影响的帖子数量
 */
const batchPosts = defineAction({
	input: z.object({
		action: z.enum(['delete', 'lock', 'unlock']),
		ids: z.array(z.string().min(1)).min(1, 'ids 必须是非空数组'),
		reason: z.string().optional()
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { action, ids, reason } = input;

		// 2. 验证 ids 数量上限
		if (ids.length > MAX_BATCH_SIZE) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `单次最多操作 ${MAX_BATCH_SIZE} 条`
			});
		}

		let result: { count: number };

		if (action === 'delete') {
			// 删除操作需填写理由
			if (!reason || !reason.trim()) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '删除理由不能为空' });
			}
			// 软删除：设置 isDeleted、deleteReason、deletedBy
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isDeleted: true,
					deleteReason: reason.trim(),
					deletedBy: currentUser.userId
				}
			});
		} else if (action === 'lock') {
			// 锁定操作需填写理由
			if (!reason || !reason.trim()) {
				throw new ActionError({ code: 'BAD_REQUEST', message: '锁定理由不能为空' });
			}
			// 锁定：设置 isLocked、lockedBy、lockReason
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isLocked: true,
					lockedBy: currentUser.userId,
					lockReason: reason.trim()
				}
			});
		} else {
			// 解锁：清除锁定状态
			result = await prisma.post.updateMany({
				where: { id: { in: ids } },
				data: {
					isLocked: false,
					lockedBy: null,
					lockReason: null
				}
			});
		}

		return { affected: result.count };
	}
});

/**
 * 评论批量操作 Action
 *
 * 管理员批量删除评论（软删除）。
 * 目前仅支持 delete 操作。
 *
 * @param input - { action: 'delete', ids: 评论ID数组 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { affected: number } 受影响的评论数量
 */
const batchComments = defineAction({
	input: z.object({
		action: z.enum(['delete']),
		ids: z.array(z.string().min(1)).min(1, 'ids 必须是非空数组')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { ids } = input;

		// 2. 验证 ids 数量上限
		if (ids.length > MAX_BATCH_SIZE) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `单次最多操作 ${MAX_BATCH_SIZE} 条`
			});
		}

		// 3. 软删除评论：设置 isDeleted = true
		const result = await prisma.comment.updateMany({
			where: { id: { in: ids } },
			data: { isDeleted: true }
		});

		return { affected: result.count };
	}
});

/**
 * 标签显示/隐藏切换 Action
 *
 * 管理员切换标签的隐藏状态。
 * 已隐藏则显示，未隐藏则隐藏。
 *
 * @param input - { tagId: 标签ID, action: 'hide' | 'show' }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { id: string, isHidden: boolean } 更新后的标签状态
 */
const toggleTagVisibility = defineAction({
	input: z.object({
		tagId: z.string().min(1, '标签 ID 不能为空'),
		action: z.enum(['hide', 'show'])
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		const { tagId, action } = input;

		// 2. 验证标签存在
		const tag = await prisma.tag.findUnique({ where: { id: tagId } });
		if (!tag) {
			throw new ActionError({ code: 'NOT_FOUND', message: '标签不存在' });
		}

		// 3. 防止重复操作
		if (action === 'hide' && tag.isHidden) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '标签已被隐藏' });
		}
		if (action === 'show' && !tag.isHidden) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '标签未被隐藏' });
		}

		// 4. 更新标签状态
		await prisma.tag.update({
			where: { id: tagId },
			data: { isHidden: action === 'hide' }
		});

		return { id: tagId, isHidden: action === 'hide' };
	}
});

export { batchUsers, batchPosts, batchComments, toggleTagVisibility };
