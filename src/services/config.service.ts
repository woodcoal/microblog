/**
 * 配置 Service
 *
 * 编排主题/强调色偏好更新的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { upsertUserSettings } from '@/lib/settings';
import { ServiceError } from '@/lib/errors';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';

// ── 类型定义 ──

export interface UpdateThemeInput {
	userId: string;
	theme?: string;
	accent?: string;
}

export interface UpdateThemeResult {
	theme: string;
	accent: string;
}

// ── 业务函数 ──

/**
 * 更新主题/强调色偏好
 *
 * 已登录用户同步主题和强调色偏好到服务端。
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 仅更新传入的字段（theme 或 accent）。
 *
 * @param input - { userId, theme?, accent? }
 * @returns 更新后的主题和强调色
 */
export async function updateTheme(input: UpdateThemeInput): Promise<UpdateThemeResult> {
	const { userId, theme, accent } = input;

	// 验证 theme 合法性
	if (theme !== undefined && !isValidTheme(theme)) {
		throw new ServiceError('BAD_REQUEST', '无效的主题');
	}

	// 验证 accent 合法性
	if (accent !== undefined && !isValidAccent(accent)) {
		throw new ServiceError('BAD_REQUEST', '无效的强调色');
	}

	// 构建更新数据
	const updateData: { theme?: string; accent?: string } = {};
	if (theme !== undefined) updateData.theme = theme;
	if (accent !== undefined) updateData.accent = accent;

	// upsert 更新或创建 UserSettings
	const settings = await upsertUserSettings(userId, updateData, {
		userId,
		theme: theme ?? DEFAULT_THEME,
		accent: accent ?? DEFAULT_ACCENT
	});

	return { theme: settings.theme, accent: settings.accent };
}
