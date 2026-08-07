/**
 * 媒体处理 Actions
 *
 * 提供文件上传功能。
 * 业务逻辑委托 media.service，本层仅负责鉴权 + 输入校验。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserFromRequest } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import {
	cancelUpload as cancelUploadService,
	uploadFile as uploadFileService
} from '@/services/media.service';

/** 将 ServiceError 转换为 ActionError */
function handleServiceError(e: unknown): never {
	if (e instanceof ServiceError) {
		throw new ActionError({ code: e.code, message: e.message });
	}
	throw e;
}

/**
 * 上传媒体文件 Action
 */
export const uploadMedia = defineAction({
	accept: 'form',
	input: z.object({
		file: z.instanceof(File),
		fileType: z.enum(['image', 'attachment']).optional()
	}),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		try {
			return await uploadFileService({
				userId: currentUser.userId,
				file: input.file,
				fileType: input.fileType
			});
		} catch (e) {
			handleServiceError(e);
		}
	}
});

/** 取消未消费的上传 reservation。 */
export const cancelUpload = defineAction({
	input: z.object({ reservationId: z.string().min(1) }),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		try {
			await cancelUploadService(currentUser.userId, input.reservationId);
			return { success: true };
		} catch (e) {
			handleServiceError(e);
		}
	}
});
