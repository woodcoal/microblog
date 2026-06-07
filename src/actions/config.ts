/**
 * 用户配置 Actions
 *
 * 提供主题设置功能。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';

/**
 * 更新主题/强调色偏好 Action
 *
 * 已登录用户通过此 Action 同步主题和强调色偏好到服务端。
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 仅更新传入的字段（theme 或 accent）。
 *
 * @param input - { theme?: 主题ID, accent?: 强调色ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns 更新后的主题和强调色
 */
export const updateTheme = defineAction({
	input: z.object({
		theme: z.string().optional(),
		accent: z.string().optional()
	}),
	handler: async (input, context) => {
		// 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { theme, accent } = input;

		// 验证 theme 合法性
		if (theme !== undefined && !isValidTheme(theme)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的主题' });
		}

		// 验证 accent 合法性
		if (accent !== undefined && !isValidAccent(accent)) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '无效的强调色' });
		}

		// 构建更新数据
		const updateData: { theme?: string; accent?: string } = {};
		if (theme !== undefined) updateData.theme = theme;
		if (accent !== undefined) updateData.accent = accent;

		// upsert 更新或创建 UserSettings
		const settings = await prisma.userSettings.upsert({
			where: { userId: currentUser.userId },
			update: updateData,
			create: {
				userId: currentUser.userId,
				theme: theme ?? DEFAULT_THEME,
				accent: accent ?? DEFAULT_ACCENT
			}
		});

		return { theme: settings.theme, accent: settings.accent };
	}
});
