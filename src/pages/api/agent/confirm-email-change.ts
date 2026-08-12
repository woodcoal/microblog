import type { APIRoute } from 'astro';
import { handleAgentError, textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { confirmEmailChange } from '@/services/auth.service';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await parseJsonBody(request)) as { token?: unknown };
		if (typeof body.token !== 'string' || !body.token.trim())
			return textErrorResponse('token 不能为空');
		if (!(await confirmEmailChange(body.token.trim())))
			return textErrorResponse('确认链接无效或已失效');
		return textResponse('ok: 邮箱已换绑，请使用新邮箱重新登录');
	} catch (error) {
		return handleAgentError(error, '确认邮箱换绑');
	}
};
