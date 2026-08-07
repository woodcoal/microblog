/**
 * 管理后台批量操作 Actions
 *
 * 定义管理员对用户、帖子、评论的批量操作服务端 Actions。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	batchUsers as batchUsersService,
	batchPosts as batchPostsService,
	batchComments as batchCommentsService,
	toggleTagVisibility as toggleTagVisibilityService,
	createUser as createUserService
} from '@/services/admin.service';
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '@/lib/config';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 用户批量操作 Action
 *
 * 管理员批量禁用或启用用户。
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
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		try {
			return await batchUsersService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 创建用户 Action。
 *
 * 仅管理员可调用；创建规则由 Service 层统一执行，因此不受前台注册开关影响。
 */
const createUser = defineAction({
	input: z.object({
		username: z
			.string()
			.regex(USERNAME_PATTERN, '用户名只能包含字母、数字和下划线，长度 3-20 个字符'),
		displayName: z.string().optional(),
		email: z.email('邮箱格式无效'),
		password: z
			.string()
			.min(PASSWORD_MIN_LENGTH, `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`),
		role: z.enum(['user', 'admin']).optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		try {
			return await createUserService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 帖子批量操作 Action
 *
 * 管理员批量删除、还原、锁定、解锁或设置全局置顶状态。
 *
 * @param input - { action: 'delete' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin', ids: 帖子ID数组, reason?: 理由 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { affected: number } 受影响的帖子数量
 */
const batchPosts = defineAction({
	input: z.object({
		action: z.enum(['delete', 'restore', 'lock', 'unlock', 'pin', 'unpin']),
		ids: z.array(z.string().min(1)).min(1, 'ids 必须是非空数组'),
		reason: z.string().optional()
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
			return await batchPostsService({
				...input,
				operatorId: currentUser.userId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 评论批量操作 Action
 *
 * 管理员批量删除评论（软删除）。
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
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		try {
			return await batchCommentsService({ ids: input.ids });
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 标签显示/隐藏切换 Action
 *
 * 管理员切换标签的隐藏状态。
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
		// 验证登录状态和管理员权限
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}
		if (currentUser.role !== 'admin') {
			throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
		}

		try {
			return await toggleTagVisibilityService(input);
		} catch (e) {
			handleServiceError(e);
		}
	}
});

export { batchUsers, createUser, batchPosts, batchComments, toggleTagVisibility };
