/** 管理端站点文案 Actions。CSRF 由全局 middleware 统一校验。 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import type { APIContext } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { actionErrorCode, ServiceError } from '@/lib/errors';
import { SITE_COPY_KEYS } from '@/lib/site-copy-definitions';
import {
	getAdminSiteCopy,
	getSiteCopyVersions,
	previewSiteCopy as previewSiteCopyService,
	updateSiteCopy as updateSiteCopyService
} from '@/services/site-copy.service';

const siteCopyKeySchema = z.enum(SITE_COPY_KEYS);

function handleServiceError(error: unknown): never {
	if (error instanceof ServiceError) {
		throw new ActionError({ code: actionErrorCode(error.code), message: error.message });
	}
	throw error;
}

async function requireAdminUser(context: Pick<APIContext, 'request' | 'cookies'>) {
	const currentUser = await getUserFromRequest(context);
	if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
	if (currentUser.role !== 'admin') {
		throw new ActionError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
	}
	return currentUser;
}

export const getSiteCopy = defineAction({
	input: z.object({ key: siteCopyKeySchema }),
	handler: async ({ key }, context) => {
		await requireAdminUser(context);
		try {
			return await getAdminSiteCopy(key);
		} catch (error) {
			handleServiceError(error);
		}
	}
});

export const getSiteCopyHistory = defineAction({
	input: z.object({ key: siteCopyKeySchema }),
	handler: async ({ key }, context) => {
		await requireAdminUser(context);
		try {
			return await getSiteCopyVersions(key);
		} catch (error) {
			handleServiceError(error);
		}
	}
});

export const previewSiteCopy = defineAction({
	input: z.object({ markdown: z.string().max(4000, '站点文案不能超过 4000 个字符') }),
	handler: async ({ markdown }, context) => {
		await requireAdminUser(context);
		try {
			return previewSiteCopyService(markdown);
		} catch (error) {
			handleServiceError(error);
		}
	}
});

export const updateSiteCopy = defineAction({
	input: z.object({
		key: siteCopyKeySchema,
		markdown: z.string().max(4000, '站点文案不能超过 4000 个字符')
	}),
	handler: async ({ key, markdown }, context) => {
		const currentUser = await requireAdminUser(context);
		try {
			return await updateSiteCopyService({ key, markdown, updatedById: currentUser.userId });
		} catch (error) {
			handleServiceError(error);
		}
	}
});
