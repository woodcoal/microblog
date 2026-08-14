/** 管理端页面定制 Actions。CSRF 由全局 middleware 统一校验。 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import {
	readPageCustomization,
	updatePageCustomization
} from '@/services/page-customization.service';

function handleServiceError(error: unknown): never {
	if (error instanceof ServiceError)
		throw new ActionError({ code: actionErrorCode(error.code), message: error.message });
	throw error;
}

async function requireCurrentUser(context: Parameters<typeof getUserFromRequest>[0]) {
	const currentUser = await getUserFromRequest(context);
	if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
	return currentUser;
}

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
		footerMarkdown: z.string().max(4000, '页脚文案不能超过 4000 个字符').optional(),
		publicAnalyticsScript: z.string().optional()
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
