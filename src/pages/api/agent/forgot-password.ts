import type { APIRoute } from 'astro';
import { handleAgentError, textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { requestPasswordResetForEmail } from '@/services/auth.service';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await parseJsonBody(request)) as { email?: unknown };
		if (typeof body.email !== 'string' || !body.email.trim())
			return textErrorResponse('email 不能为空');
		await requestPasswordResetForEmail(body.email.trim());
		return textResponse('ok: 若邮箱可用，重置邮件已发送');
	} catch (error) {
		return handleAgentError(error, '申请重置密码');
	}
};
