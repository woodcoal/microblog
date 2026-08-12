import type { APIRoute } from 'astro';
import { handleAgentError, requireAgentAuth, textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { deleteAccount } from '@/services/account-deletion.service';

export const POST: APIRoute = async (context) => {
	const currentUser = await requireAgentAuth(context);
	if (currentUser instanceof Response) return currentUser;
	try {
		const body = (await parseJsonBody(context.request)) as { currentPassword?: unknown };
		if (typeof body.currentPassword !== 'string' || !body.currentPassword)
			return textErrorResponse('currentPassword 不能为空');
		await deleteAccount({ userId: currentUser.userId, currentPassword: body.currentPassword });
		return textResponse('ok: 账号已永久注销');
	} catch (error) {
		return handleAgentError(error, '永久注销账号');
	}
};
