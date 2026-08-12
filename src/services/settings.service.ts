/**
 * 设置 Service
 *
 * 编排用户设置、个人资料更新的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findUserSettings, upsertUserSettings } from '@/lib/settings';
import { findUserById, updateUser } from '@/lib/user';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';
import { uploadFile as uploadFileService } from '@/services/media.service';
import { findFileStorageByFilePath, deleteFileRef } from '@/lib/upload';
import { renameUsername } from '@/services/username.service';

/** 评论排序合法值 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/** 显示名最大长度 */
const DISPLAY_NAME_MAX_LENGTH = 50;

/** 简介最大长度 */
const BIO_MAX_LENGTH = 160;

/** 个人备注最大长度 */
const NOTE_MAX_LENGTH = 2000;

// ── Agent API 专用查询函数 ──

/**
 * 获取用户个人记录
 *
 * 查询用户的 note 字段内容。
 * 供 Agent API 层读取个人记录。
 *
 * @param input - { userId }
 * @returns note 内容，不存在时返回空字符串
 */
export async function getUserNote(input: { userId: string }): Promise<string> {
	const user = await findUserById(input.userId, {
		note: true
	});
	return user?.note ?? '';
}

// ── 类型定义 ──

export interface UpdateProfileInput {
	userId: string;
	displayName?: string;
	bio?: string;
	/** null 表示清除头像；数据库以空字符串保存未设置头像。 */
	avatarUrl?: string | null;
	note?: string;
}

export interface UpdateProfileResult {
	displayName: string;
	bio: string;
	avatarUrl: string;
}

/** 自助改名只允许本人调用；额度消耗由 username service 的事务保证。 */
export async function renameOwnUsername(input: { userId: string; username: string }) {
	return renameUsername({ ...input, actorId: input.userId });
}

export interface GetSettingsInput {
	userId: string;
}

export interface GetSettingsResult {
	theme: string;
	accent: string;
	commentSortOrder: string;
	notificationsEnabled: boolean;
	displayName: string;
	bio: string;
	avatarUrl: string;
}

export interface UpdateSettingsInput {
	userId: string;
	theme?: string;
	accent?: string;
	commentSortOrder?: string;
	notificationsEnabled?: boolean;
}

export interface UpdateSettingsResult {
	theme: string;
	accent: string;
	commentSortOrder: string;
	notificationsEnabled: boolean;
}

// ── 业务函数 ──

/**
 * 更新个人资料
 *
 * 支持更新 displayName、bio、avatarUrl、note。
 * 只更新传入的字段，未传入的字段保持不变。
 */
export async function updateProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
	const { userId, displayName, bio, avatarUrl, note } = input;

	// 验证 displayName 长度
	if (displayName !== undefined) {
		if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
			throw new ServiceError(
				'BAD_REQUEST',
				`显示名长度需在 1-${DISPLAY_NAME_MAX_LENGTH} 字符之间`
			);
		}
	}

	// 验证 bio 长度
	if (bio !== undefined && bio.length > BIO_MAX_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `简介最多 ${BIO_MAX_LENGTH} 字符`);
	}

	// 验证 avatarUrl 格式（允许本站相对路径 /uploads/ 或绝对 URL）
	if (avatarUrl !== undefined && avatarUrl !== '' && avatarUrl !== null) {
		const isLocalPath = avatarUrl.startsWith('/uploads/');
		if (!isLocalPath) {
			try {
				new URL(avatarUrl);
			} catch {
				throw new ServiceError('BAD_REQUEST', '头像 URL 格式无效');
			}
		}
	}

	// 验证 note 长度
	if (note !== undefined && note.length > NOTE_MAX_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `备注最多 ${NOTE_MAX_LENGTH} 字符`);
	}

	// 构建更新数据（只更新传入的字段）
	const updateData: {
		displayName?: string;
		bio?: string;
		avatarUrl?: string;
		note?: string;
	} = {};
	if (displayName !== undefined) updateData.displayName = displayName;
	if (bio !== undefined) updateData.bio = bio.trim();
	if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl ?? '';
	if (note !== undefined) updateData.note = note.trim();

	// 更新 User 表
	const updatedUser = await updateUser(userId, updateData, {
		displayName: true,
		bio: true,
		avatarUrl: true
	});

	return updatedUser;
}

/**
 * 获取当前用户设置
 */
export async function getSettings(input: GetSettingsInput): Promise<GetSettingsResult> {
	const [settings, user] = await Promise.all([
		findUserSettings(input.userId),
		findUserById(input.userId, {
			displayName: true,
			bio: true,
			avatarUrl: true
		})
	]);

	return {
		theme: settings?.theme ?? DEFAULT_THEME,
		accent: settings?.accent ?? DEFAULT_ACCENT,
		commentSortOrder: settings?.commentSortOrder ?? 'desc',
		notificationsEnabled: settings?.notificationsEnabled ?? true,
		displayName: user?.displayName ?? '',
		bio: user?.bio ?? '',
		avatarUrl: user?.avatarUrl ?? ''
	};
}

/**
 * 更新用户设置
 */
export async function updateSettings(input: UpdateSettingsInput): Promise<UpdateSettingsResult> {
	const { userId, theme, accent, commentSortOrder, notificationsEnabled } = input;

	// 验证 theme 合法性
	if (theme !== undefined && !isValidTheme(theme)) {
		throw new ServiceError('BAD_REQUEST', '无效的主题');
	}

	// 验证 accent 合法性
	if (accent !== undefined && !isValidAccent(accent)) {
		throw new ServiceError('BAD_REQUEST', '无效的强调色');
	}

	// 验证 commentSortOrder 合法性
	if (commentSortOrder !== undefined && !VALID_SORT_ORDERS.includes(commentSortOrder)) {
		throw new ServiceError('BAD_REQUEST', '排序值必须为 asc 或 desc');
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
	if (notificationsEnabled !== undefined) updateData.notificationsEnabled = notificationsEnabled;

	// upsert 更新或创建 UserSettings
	const settings = await upsertUserSettings(userId, updateData, {
		userId,
		theme: theme ?? DEFAULT_THEME,
		accent: accent ?? DEFAULT_ACCENT,
		commentSortOrder: commentSortOrder ?? 'desc',
		notificationsEnabled: notificationsEnabled ?? true
	});

	return {
		theme: settings.theme,
		accent: settings.accent,
		commentSortOrder: settings.commentSortOrder,
		notificationsEnabled: settings.notificationsEnabled
	};
}

// ── 修改密码 ──

export interface ChangePasswordInput {
	userId: string;
	oldPassword: string;
	newPassword: string;
}

/**
 * 修改密码
 *
 * 验证旧密码正确性后，生成新密码哈希并更新用户记录。
 *
 * @param input - { userId, oldPassword, newPassword }
 * @returns 密码修改成功消息
 * @throws ServiceError 用户不存在、旧密码不正确、新密码长度不足
 */
export async function changePassword(input: ChangePasswordInput): Promise<{ message: string }> {
	const { userId, oldPassword, newPassword } = input;

	// 查询用户当前密码哈希
	const user = await findUserById(userId, { passwordHash: true });
	if (!user) {
		throw new ServiceError('NOT_FOUND', '用户不存在');
	}

	// 验证旧密码正确性
	const isOldPasswordValid = await verifyPassword(oldPassword, user.passwordHash);
	if (!isOldPasswordValid) {
		throw new ServiceError('BAD_REQUEST', '旧密码不正确');
	}

	// 生成新密码哈希并更新
	const newPasswordHash = await hashPassword(newPassword);
	await updateUser(userId, { passwordHash: newPasswordHash });

	return { message: '密码修改成功' };
}

// ── 上传头像 ──

export interface UploadAvatarInput {
	userId: string;
	image: File;
}

export interface UploadAvatarResult {
	avatarUrl: string;
}

/**
 * 上传头像
 *
 * 调用 uploadFileService 保存文件，更新用户头像 URL，并清理旧头像文件引用。
 *
 * @param input - { userId, image }
 * @returns 新头像 URL
 * @throws ServiceError 文件上传失败
 */
export async function uploadAvatar(input: UploadAvatarInput): Promise<UploadAvatarResult> {
	const { userId, image } = input;

	// 保存文件
	const fileResult = await uploadFileService({ userId, file: image, fileType: 'image' });
	const { consumeStandaloneUpload } = await import('@/services/media.service');
	await consumeStandaloneUpload(userId, fileResult.reservationId);
	const newAvatarUrl = fileResult.url;

	// 获取旧头像 URL
	const user = await findUserById(userId, { avatarUrl: true });

	// 更新用户头像 URL
	await updateUser(userId, { avatarUrl: newAvatarUrl });

	// 清理旧头像文件的引用计数（仅清理本站上传的头像）
	if (user?.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
		const oldFilePath = user.avatarUrl.replace('/uploads/', '');
		try {
			const oldFile = await findFileStorageByFilePath(oldFilePath);
			if (oldFile) {
				await deleteFileRef(oldFile.id);
			}
		} catch (err) {
			console.error('清理旧头像文件引用失败:', err);
		}
	}

	return { avatarUrl: newAvatarUrl };
}

// ── 更新评论排序偏好 ──

export interface UpdateCommentSortInput {
	userId: string;
	order: string;
}

export interface UpdateCommentSortResult {
	order: string;
}

/**
 * 更新评论排序偏好
 *
 * 校验排序值合法性后，upsert 更新或创建 UserSettings 记录。
 *
 * @param input - { userId, order }
 * @returns 更新后的排序值
 * @throws ServiceError 排序值不合法
 */
export async function updateCommentSort(
	input: UpdateCommentSortInput
): Promise<UpdateCommentSortResult> {
	const { userId, order } = input;

	// 校验排序值合法性
	if (!VALID_SORT_ORDERS.includes(order)) {
		throw new ServiceError('BAD_REQUEST', '排序值必须为 asc 或 desc');
	}

	// upsert 更新或创建 UserSettings
	await upsertUserSettings(
		userId,
		{ commentSortOrder: order },
		{
			userId,
			commentSortOrder: order
		}
	);

	return { order };
}
