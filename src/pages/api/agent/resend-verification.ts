import type { APIRoute } from 'astro';
import { resendEmailVerification } from '@/lib/email-verification';
import { handleAgentError, textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

/** 始终使用同一成功文本，避免邮箱枚举。 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await parseJsonBody(request)) as { email?: unknown };
		if (typeof body.email !== 'string' || !body.email.trim())
			return textErrorResponse('email 不能为空');
		await resendEmailVerification(body.email.trim());
		return textResponse('ok: 若邮箱可用，验证邮件已发送');
	} catch (error) {
		return handleAgentError(error, '重发邮箱验证');
	}
};
