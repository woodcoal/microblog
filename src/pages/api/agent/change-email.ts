import type { APIRoute } from 'astro';
import { handleAgentError, requireAgentAuth, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { requestEmailChange } from '@/services/auth.service';

export const POST: APIRoute = async (context) => {
	const currentUser = await requireAgentAuth(context);
	if (currentUser instanceof Response) return currentUser;
	try {
		const body = (await parseJsonBody(context.request)) as {
			currentPassword?: unknown;
			targetEmail?: unknown;
		};
		if (typeof body.currentPassword !== 'string' || !body.currentPassword)
			throw new Error('currentPassword 不能为空');
		if (typeof body.targetEmail !== 'string' || !body.targetEmail.trim())
			throw new Error('targetEmail 不能为空');
		await requestEmailChange({
			userId: currentUser.userId,
			currentPassword: body.currentPassword,
			targetEmail: body.targetEmail.trim()
		});
		return textResponse('ok: 若新邮箱可用，确认邮件已发送', 202);
	} catch (error) {
		return handleAgentError(error, '发起邮箱换绑');
	}
};
