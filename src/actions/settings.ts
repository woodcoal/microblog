/**
 * 设置 Actions
 *
 * 提供用户设置、个人资料、密码修改、头像上传、评论排序偏好的服务端 Actions。
 * 替代传统 REST API 路由，使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest, verifyPassword, hashPassword } from '@/lib/auth';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';
import { saveFile, deleteFileRef } from '@/lib/upload';

/** 评论排序合法值 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/** 显示名最大长度 */
const DISPLAY_NAME_MAX_LENGTH = 50;

/** 简介最大长度 */
const BIO_MAX_LENGTH = 160;

/** 个人备注最大长度 */
const NOTE_MAX_LENGTH = 2000;

/** 头像最大文件大小：2MB */
const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

/** 头像允许的图片扩展名 */
const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * 获取当前用户设置 Action
 *
 * 并行查询 UserSettings 和 User 基本信息，合并返回。
 * 如果 UserSettings 不存在，返回默认值。
 * 需要登录认证。
 *
 * @param input - 无
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { theme, accent, commentSortOrder, notificationsEnabled, displayName, bio, avatarUrl }
 */
const getSettings = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		// 并行查询用户设置和用户基本信息
		const [settings, user] = await Promise.all([
			prisma.userSettings.findUnique({
				where: { userId: currentUser.userId }
			}),
			prisma.user.findUnique({
				where: { id: currentUser.userId },
				select: {
					displayName: true,
					bio: true,
					avatarUrl: true
				}
			})
		]);

		// 合并设置与用户信息，设置不存在时使用默认值
		return {
			theme: settings?.theme ?? DEFAULT_THEME,
			accent: settings?.accent ?? DEFAULT_ACCENT,
			commentSortOrder: settings?.commentSortOrder ?? 'asc',
			notificationsEnabled: settings?.notificationsEnabled ?? true,
			displayName: user?.displayName ?? '',
			bio: user?.bio ?? '',
			avatarUrl: user?.avatarUrl ?? ''
		};
	}
});

/**
 * 更新用户设置 Action
 *
 * 更新主题、强调色、评论排序、通知开关等偏好。
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 仅更新传入的字段。
 * 需要登录认证。
 *
 * @param input - { theme?, accent?, commentSortOrder?, notificationsEnabled? }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的设置数据
 */
const updateSettings = defineAction({
	input: z.object({
		theme: z.string().optional(),
		accent: z.string().optional(),
		commentSortOrder: z.string().optional(),
		notificationsEnabled: z.boolean().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { theme, accent, commentSortOrder, notificationsEnabled } = input;

		// 验证 theme 合法性
		if (theme !== undefined && !isValidTheme(theme)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的主题' });
		}

		// 验证 accent 合法性
		if (accent !== undefined && !isValidAccent(accent)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的强调色' });
		}

		// 验证 commentSortOrder 合法性
		if (commentSortOrder !== undefined && !VALID_SORT_ORDERS.includes(commentSortOrder)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '排序值必须为 asc 或 desc' });
		}

		// 构建更新数据（只更新传入的字段）
		const updateData: {
			theme?: string;
			accent?: string;
			commentSortOrder?: string;
			notificationsEnabled?: boolean;
		} = {};
		if (theme !== undefined) updateData.theme = theme;
		if (accent !== undefined) updateData.accent = accent;
		if (commentSortOrder !== undefined) updateData.commentSortOrder = commentSortOrder;
		if (notificationsEnabled !== undefined)
			updateData.notificationsEnabled = notificationsEnabled;

		// upsert 更新或创建 UserSettings
		const settings = await prisma.userSettings.upsert({
			where: { userId: currentUser.userId },
			update: updateData,
			create: {
				userId: currentUser.userId,
				theme: theme ?? DEFAULT_THEME,
				accent: accent ?? DEFAULT_ACCENT,
				commentSortOrder: commentSortOrder ?? 'asc',
				notificationsEnabled: notificationsEnabled ?? true
			}
		});

		return {
			theme: settings.theme,
			accent: settings.accent,
			commentSortOrder: settings.commentSortOrder,
			notificationsEnabled: settings.notificationsEnabled
		};
	}
});

/**
 * 更新个人资料 Action
 *
 * 支持更新 displayName、bio、avatarUrl、note。
 * 只更新请求体中传入的字段，未传入的字段保持不变。
 * 需要登录认证。
 *
 * @param input - { displayName?, bio?, avatarUrl?, note? }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { displayName, bio, avatarUrl } 更新后的个人资料（不含 note）
 */
const updateProfile = defineAction({
	input: z.object({
		displayName: z.string().optional(),
		bio: z.string().optional(),
		avatarUrl: z.string().optional(),
		note: z.string().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { displayName, bio, avatarUrl, note } = input;

		// 验证 displayName 长度
		if (displayName !== undefined) {
			if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
				throw new ActionError({
					code: 'BAD_REQUEST',
					message: `显示名长度需在 1-${DISPLAY_NAME_MAX_LENGTH} 字符之间`
				});
			}
		}

		// 验证 bio 长度
		if (bio !== undefined && bio.length > BIO_MAX_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `简介最多 ${BIO_MAX_LENGTH} 字符`
			});
		}

		// 验证 avatarUrl 格式（允许本站相对路径 /uploads/ 或绝对 URL）
		if (avatarUrl !== undefined && avatarUrl !== '' && avatarUrl !== null) {
			const isLocalPath = avatarUrl.startsWith('/uploads/');
			if (!isLocalPath) {
				try {
					new URL(avatarUrl);
				} catch {
					throw new ActionError({ code: 'BAD_REQUEST', message: '头像 URL 格式无效' });
				}
			}
		}

		// 验证 note 长度
		if (note !== undefined && note.length > NOTE_MAX_LENGTH) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: `备注最多 ${NOTE_MAX_LENGTH} 字符`
			});
		}

		// 构建更新数据（只更新传入的字段）
		const updateData: {
			displayName?: string;
			bio?: string;
			avatarUrl?: string;
			note?: string;
		} = {};
		if (displayName !== undefined) updateData.displayName = displayName;
		if (bio !== undefined) updateData.bio = bio;
		if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
		if (note !== undefined) updateData.note = note;

		// 更新 User 表
		const updatedUser = await prisma.user.update({
			where: { id: currentUser.userId },
			data: updateData,
			select: {
				displayName: true,
				bio: true,
				avatarUrl: true
			}
		});

		return updatedUser;
	}
});

/**
 * 修改密码 Action
 *
 * 验证旧密码正确性后，哈希新密码并更新。
 * 需要登录认证。
 *
 * @param input - { oldPassword: 旧密码, newPassword: 新密码 }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { message: '密码修改成功' }
 */
const changePassword = defineAction({
	input: z.object({
		oldPassword: z.string().min(1, '旧密码不能为空'),
		newPassword: z.string().min(1, '新密码不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
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
 *
 * 接收 FormData 中的 image 字段，保存文件后更新用户 avatarUrl。
 * 头像限定为图片格式，最大 2MB。
 * 同时清理旧头像文件的引用计数。
 * 需要登录认证。
 *
 * @param input - FormData，包含 image: File
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { avatarUrl } 新的头像 URL
 */
const uploadAvatar = defineAction({
	accept: 'form',
	input: z.object({
		image: z.instanceof(File)
	}),
	handler: async (input, context) => {
		// 验证登录状态
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
		let fileStorage;
		try {
			const result = await saveFile(image, 'image');
			fileStorage = result.fileStorage;
		} catch (err: any) {
			throw new ActionError({
				code: 'BAD_REQUEST',
				message: err.message || '文件上传失败'
			});
		}

		const newAvatarUrl = `/uploads/${fileStorage.filePath}`;

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
				// 旧文件清理失败不影响主流程
				console.error('清理旧头像文件引用失败:', err);
			}
		}

		return { avatarUrl: newAvatarUrl };
	}
});

/**
 * 更新评论排序偏好 Action
 *
 * 更新用户的评论排序偏好（asc 或 desc）。
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 需要登录认证。
 *
 * @param input - { order: 排序值（'asc' 或 'desc'） }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { order } 当前排序偏好
 */
const updateCommentSort = defineAction({
	input: z.object({
		order: z.string().min(1, '排序值不能为空')
	}),
	handler: async (input, context) => {
		// 验证登录状态
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
