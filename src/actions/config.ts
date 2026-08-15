/**
 * 用户配置 Actions
 *
 * 提供主题设置功能。
 * 薄适配层：鉴权 → zod 校验 → 调用 service → handleServiceError 转换。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	readSystemConfiguration,
	testSystemSmtp,
	updateSystemConfiguration
} from '@/services/system-config.service';
import {
	readPageCustomization,
	updatePageCustomization
} from '@/services/page-customization.service';
import { updateTheme as updateThemeService } from '@/services/config.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(e.code), message: e.message });
	}
	throw e;
}

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

		try {
			return await updateThemeService({
				userId: currentUser.userId,
				...input
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

const smtpInput = z.object({
	host: z.string().trim().min(1, 'SMTP 主机不能为空'),
	port: z.number().int().min(1).max(65535),
	security: z.enum(['tls', 'starttls']),
	username: z.string().trim().min(1, 'SMTP 账号不能为空'),
	password: z.string().optional(),
	clearPassword: z.boolean().optional(),
	fromName: z.string().trim().min(1, '发件人名称不能为空'),
	fromAddress: z.email('发件人邮箱格式无效')
});

async function requireCurrentUser(context: Parameters<typeof getUserFromRequest>[0]) {
	const currentUser = await getUserFromRequest(context);
	if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
	return currentUser;
}

/** 管理员读取邮件策略与已脱敏的 SMTP 配置。服务层每次重新核验数据库角色。 */
export const getSystemConfiguration = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		const currentUser = await requireCurrentUser(context);
		try {
			return await readSystemConfiguration(currentUser.userId);
		} catch (error) {
			handleServiceError(error);
		}
	}
});

/** 管理员更新邮件策略与 SMTP 配置；空密码保留旧值，clearPassword 明确清除。 */
export const updateSystemConfigurationAction = defineAction({
	input: z.object({
		emailOwnershipEnabled: z.boolean().optional(),
		smtp: smtpInput.optional(),
		mailTemplates: z
			.object({
				verifyEmail: z
					.object({
						subject: z.string().trim(),
						body: z.string()
					})
					.optional(),
				passwordReset: z
					.object({
						subject: z.string().trim(),
						body: z.string()
					})
					.optional(),
				changeEmail: z
					.object({
						subject: z.string().trim(),
						body: z.string()
					})
					.optional()
			})
			.optional()
	}),
	handler: async (input, context) => {
		const currentUser = await requireCurrentUser(context);
		try {
			return await updateSystemConfiguration({ userId: currentUser.userId, ...input });
		} catch (error) {
			handleServiceError(error);
		}
	}
});

/** 仅执行 SMTP 握手、认证与 NOOP，不发送邮件。 */
export const testSystemSmtpAction = defineAction({
	input: z.object({ smtp: smtpInput.optional() }),
	handler: async ({ smtp }, context) => {
		const currentUser = await requireCurrentUser(context);
		try {
			await testSystemSmtp(currentUser.userId, smtp);
			return { tested: true };
		} catch (error) {
			handleServiceError(error);
		}
	}
});

export const getPageCustomization = defineAction({
	input: z.void(),
	handler: async (_, context) => {
		const currentUser = await requireCurrentUser(context);
		try {
			return await readPageCustomization(currentUser.userId);
		} catch (error) {
			handleServiceError(error);
		}
	}
});

export const updatePageCustomizationAction = defineAction({
	input: z.object({
		publicAnalyticsScript: z.string().max(64 * 1024)
	}),
	handler: async (input, context) => {
		const currentUser = await requireCurrentUser(context);
		try {
			return await updatePageCustomization({ userId: currentUser.userId, ...input });
		} catch (error) {
			handleServiceError(error);
		}
	}
});
