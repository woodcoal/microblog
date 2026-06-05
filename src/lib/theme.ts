/**
 * 主题切换工具模块
 *
 * 定义可用主题列表、主题 ID 类型、默认主题，
 * 以及主题验证和从数据库读取用户主题偏好的函数。
 */
import { prisma } from '@/lib/db';

/** 可用主题列表 */
export const THEMES = [
	{ id: 'light', name: '亮色' },
	{ id: 'dark', name: '暗色' },
	{ id: 'eye-care', name: '护眼' },
	{ id: 'high-contrast', name: '高对比度' }
] as const;

/** 可用强调色列表 */
export const ACCENTS = [
	{ id: 'blue', name: '蓝色' },
	{ id: 'green', name: '绿色' },
	{ id: 'orange', name: '橙色' },
	{ id: 'purple', name: '紫色' },
	{ id: 'rose', name: '玫红' }
] as const;

/** 主题 ID 联合类型，从 THEMES 推导 */
type ThemeId = (typeof THEMES)[number]['id'];

/** 强调色 ID 联合类型，从 ACCENTS 推导 */
type AccentId = (typeof ACCENTS)[number]['id'];

/** 默认主题 */
export const DEFAULT_THEME: ThemeId = 'light';

/** 默认强调色（空字符串表示使用主题默认色） */
export const DEFAULT_ACCENT = '';

/**
 * 验证主题 ID 是否合法
 *
 * 检查给定字符串是否在 THEMES 列表中存在。
 *
 * @param id - 待验证的主题 ID
 * @returns 合法返回 true，否则返回 false
 */
export function isValidTheme(id: string): boolean {
	return THEMES.some((theme) => theme.id === id);
}

/**
 * 验证强调色 ID 是否合法
 *
 * 检查给定字符串是否在 ACCENTS 列表中存在。
 * 空字符串视为合法（表示使用主题默认色）。
 *
 * @param id - 待验证的强调色 ID
 * @returns 合法返回 true，否则返回 false
 */
export function isValidAccent(id: string): boolean {
	if (id === '') return true;
	return ACCENTS.some((accent) => accent.id === id);
}

/**
 * 从数据库读取用户主题偏好
 *
 * 查询 UserSettings 表获取用户设置的主题，
 * 如果用户没有设置记录或主题不合法，则返回默认主题。
 *
 * @param userId - 用户 ID
 * @returns 用户主题偏好，未设置时返回 DEFAULT_THEME
 */
export async function getThemeFromUserSettings(userId: string): Promise<ThemeId> {
	const settings = await prisma.userSettings.findUnique({
		where: { userId }
	});

	if (settings && isValidTheme(settings.theme)) {
		return settings.theme as ThemeId;
	}

	return DEFAULT_THEME;
}

/**
 * 从数据库读取用户强调色偏好
 *
 * 查询 UserSettings 表获取用户设置的强调色，
 * 如果用户没有设置记录或强调色不合法，则返回默认值（空字符串）。
 *
 * @param userId - 用户 ID
 * @returns 用户强调色偏好，未设置时返回 DEFAULT_ACCENT
 */
export async function getAccentFromUserSettings(userId: string): Promise<string> {
	const settings = await prisma.userSettings.findUnique({
		where: { userId }
	});

	if (settings && isValidAccent(settings.accent)) {
		return settings.accent;
	}

	return DEFAULT_ACCENT;
}
