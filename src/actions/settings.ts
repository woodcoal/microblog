/**
 * 设置 Actions
 *
 * 提供用户设置、个人资料、密码修改、头像上传、评论排序偏好的服务端 Actions。
 * 业务逻辑委托 settings.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest, verifyPassword, hashPassword } from '@/lib/auth';
import { saveFile, deleteFileRef } from '@/lib/upload';
import { ServiceError } from '@/lib/errors';
import {
	getSettings as getSettingsService,
	updateSettings as updateSettingsService,
	updateProfile as updateProfileService
} from '@/services/settings.service';
import { uploadFile as uploadFileService } from '@/services/media.service';

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

/**
 * 修改密码 Action
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

		// 查询用户当前密码哈希
		const user = await prisma.user.findUnique({
			where: { id: currentUser.userId },
			select: { passwordHash: true }
		});

		if (!user) {
			throw new ActionError({ code: 'NOT_FOUND', message: '用户不存在' });
		}

		// 验证旧密码正确性
		const isOldPasswordValid = await verifyPassword(oldPassword, user.passwordHash);
		if (!isOldPasswordValid) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '旧密码不正确' });
		}

		// 生成新密码哈希并更新
		const newPasswordHash = await hashPassword(newPassword);
		await prisma.user.update({
			where: { id: currentUser.userId },
			data: { passwordHash: newPasswordHash }
		});

		return { message: '密码修改成功' };
	}
});

/**
 * 上传头像 Action
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

		// 保存文件
		let fileResult;
		try {
			fileResult = await uploadFileService({ file: image, fileType: 'image' });
		} catch (e) {
			handleServiceError(e);
		}

		const newAvatarUrl = fileResult!.url;

		// 获取旧头像 URL，更新用户记录
		const user = await prisma.user.findUnique({
			where: { id: currentUser.userId },
			select: { avatarUrl: true }
		});

		await prisma.user.update({
			where: { id: currentUser.userId },
			data: { avatarUrl: newAvatarUrl }
		});

		// 清理旧头像文件的引用计数（仅清理本站上传的头像）
		if (user?.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
			const oldFilePath = user.avatarUrl.replace('/uploads/', '');
			try {
				const oldFile = await prisma.fileStorage.findUnique({
					where: { filePath: oldFilePath }
				});
				if (oldFile) {
					await deleteFileRef(oldFile.id);
				}
			} catch (err) {
				console.error('清理旧头像文件引用失败:', err);
			}
		}

		return { avatarUrl: newAvatarUrl };
	}
});

/**
 * 更新评论排序偏好 Action
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

		// upsert 更新或创建 UserSettings
		await prisma.userSettings.upsert({
			where: { userId: currentUser.userId },
			update: { commentSortOrder: order },
			create: {
				userId: currentUser.userId,
				commentSortOrder: order
			}
		});

		return { order };
	}
});

export {
	getSettings,
	updateSettings,
	updateProfile,
	changePassword,
	uploadAvatar,
	updateCommentSort
};
