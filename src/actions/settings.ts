/**
 * 设置 Actions
 *
 * 提供用户设置、个人资料、密码修改、头像上传、评论排序偏好的服务端 Actions。
 * 业务逻辑委托 settings.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { generateToken, getUserFromRequest, setTokenCookie } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	getSettings as getSettingsService,
	updateSettings as updateSettingsService,
	updateProfile as updateProfileService,
	changePassword as changePasswordService,
	uploadAvatar as uploadAvatarService,
	updateCommentSort as updateCommentSortService,
	renameOwnUsername as renameOwnUsernameService
} from '@/services/settings.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/** 评论排序合法值 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/** 头像最大文件大小：2MB */
const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

/** 头像允许的图片扩展名 */
const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * 获取当前用户设置 Action
 */
const getSettings = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await getSettingsService({ userId: currentUser.userId });
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 更新用户设置 Action
 */
const updateSettings = defineAction({
	input: z.object({
		theme: z.string().optional(),
		accent: z.string().optional(),
		commentSortOrder: z.string().optional(),
		notificationsEnabled: z.boolean().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await updateSettingsService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 更新个人资料 Action
 */
const updateProfile = defineAction({
	input: z.object({
		displayName: z.string().optional(),
		bio: z.string().optional(),
		avatarUrl: z.string().optional(),
		note: z.string().optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await updateProfileService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

const renameUsername = defineAction({
	input: z.object({ username: z.string().min(1, '用户名不能为空') }),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		try {
			const result = await renameOwnUsernameService({
				userId: currentUser.userId,
				username: input.username
			});
			// 用户名存在于 JWT 载荷中。改名后立即换发 cookie，避免导航和资料链接继续使用旧名。
			setTokenCookie(
				context,
				await generateToken({
					userId: currentUser.userId,
					username: result.username,
					role: currentUser.role
				})
			);
			return result;
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 修改密码 Action
 *
 * 鉴权 → zod 校验 → 调用 service
 */
const changePassword = defineAction({
	input: z.object({
		oldPassword: z.string().min(1, '旧密码不能为空'),
		newPassword: z.string().min(1, '新密码不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { oldPassword, newPassword } = input;

		// 验证新密码长度
		if (newPassword.length < 8) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '新密码至少 8 个字符' });
		}

		try {
			return await changePasswordService({
				userId: currentUser.userId,
				oldPassword,
				newPassword
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 上传头像 Action
 *
 * 鉴权 → 文件类型/大小校验 → 调用 service
 */
const uploadAvatar = defineAction({
	accept: 'form',
	input: z.object({
		image: z.instanceof(File)
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { image } = input;

		// 校验文件类型
		const ext = image.name.split('.').pop()?.toLowerCase() || '';
		if (!AVATAR_EXTENSIONS.includes(ext)) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `不支持的文件类型: .${ext}，允许的类型: ${AVATAR_EXTENSIONS.join(', ')}`
			});
		}

		// 校验文件大小
		if (image.size > AVATAR_MAX_SIZE) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '头像图片大小不能超过 2MB' });
		}

		try {
			return await uploadAvatarService({
				userId: currentUser.userId,
				image
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/**
 * 更新评论排序偏好 Action
 *
 * 鉴权 → 排序值校验 → 调用 service
 */
const updateCommentSort = defineAction({
	input: z.object({
		order: z.string().min(1, '排序值不能为空')
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { order } = input;

		// 校验排序值合法性
		if (!VALID_SORT_ORDERS.includes(order)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '排序值必须为 asc 或 desc' });
		}

		try {
			return await updateCommentSortService({
				userId: currentUser.userId,
				order
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

export {
	getSettings,
	updateSettings,
	updateProfile,
	renameUsername,
	changePassword,
	uploadAvatar,
	updateCommentSort
};
