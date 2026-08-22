/**
 * 内容管理 Actions
 *
 * 提供帖子、评论的创建、更新、删除功能。
 * 业务逻辑委托 content.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	createComment as createCommentService,
	deleteComment as deleteCommentService,
	createPost as createPostService,
	updatePost as updatePostService,
	deletePost as deletePostService
} from '@/services/content.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(e.code), message: e.message });
	}
	throw e;
}

/**
 * 创建帖子 Action
 */
export const createPost = defineAction({
	input: z.object({
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		images: z.array(z.string()).optional(),
		thumbnailFileStorageId: z.string().nullable().optional(),
		attachmentFileStorageIds: z.array(z.string()).max(10).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional(),
		mode: z.string().optional(),
		title: z.string().optional(),
		categoryId: z.string().optional(),
		customCategory: z.string().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await createPostService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 编辑帖子 Action
 */
export const updatePost = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '帖子内容不能为空'),
		visibility: z.string().optional(),
		mediaIds: z.array(z.string()).optional(),
		images: z.array(z.string()).optional(),
		thumbnailFileStorageId: z.string().nullable().optional(),
		attachmentFileStorageIds: z.array(z.string()).max(10).optional(),
		password: z.string().optional(),
		allowedUserIds: z.array(z.string()).optional(),
		mode: z.string().optional(),
		title: z.string().optional(),
		categoryId: z.string().optional(),
		customCategory: z.string().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await updatePostService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 删除帖子 Action（软删除）
 */
export const deletePost = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await deletePostService({
				userId: currentUser.userId,
				postId: input.postId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 创建评论 Action
 */
export const createComment = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		content: z.string().min(1, '评论内容不能为空'),
		parentId: z.string().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await createCommentService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 删除评论 Action（软删除）
 */
export const deleteComment = defineAction({
	input: z.object({
		commentId: z.string().min(1, '评论 ID 不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await deleteCommentService({
				userId: currentUser.userId,
				commentId: input.commentId
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});
