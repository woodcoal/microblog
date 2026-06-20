/**
 * 设置 Service
 *
 * 编排用户设置、个人资料更新的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findUserSettings, upsertUserSettings } from '@/lib/settings';
import { findUserById, updateUser } from '@/lib/user';
import { ServiceError } from '@/lib/errors';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';

/** 评论排序合法值 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/** 显示名最大长度 */
const DISPLAY_NAME_MAX_LENGTH = 50;

/** 简介最大长度 */
const BIO_MAX_LENGTH = 160;

/** 个人备注最大长度 */
const NOTE_MAX_LENGTH = 2000;

// ── 类型定义 ──

export interface UpdateProfileInput {
	userId: string;
	displayName?: string;
	bio?: string;
	avatarUrl?: string;
	note?: string;
}

export interface UpdateProfileResult {
	displayName: string;
	bio: string;
	avatarUrl: string;
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
	if (bio !== undefined) updateData.bio = bio;
	if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
	if (note !== undefined) updateData.note = note;

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
		commentSortOrder: settings?.commentSortOrder ?? 'asc',
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
		commentSortOrder: commentSortOrder ?? 'asc',
		notificationsEnabled: notificationsEnabled ?? true
	});

	return {
		theme: settings.theme,
		accent: settings.accent,
		commentSortOrder: settings.commentSortOrder,
		notificationsEnabled: settings.notificationsEnabled
	};
}
