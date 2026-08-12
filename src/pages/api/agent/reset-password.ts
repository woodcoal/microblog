import type { APIRoute } from 'astro';
import { textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { resetPassword } from '@/services/auth.service';
import { ServiceError } from '@/lib/errors';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await parseJsonBody(request)) as { token?: unknown; password?: unknown };
		if (typeof body.token !== 'string' || !body.token.trim())
			return textErrorResponse('token 不能为空');
		if (typeof body.password !== 'string' || !body.password)
			return textErrorResponse('password 不能为空');
		if (!(await resetPassword({ token: body.token.trim(), password: body.password })))
			return textErrorResponse('重置链接无效或已失效');
		return textResponse('ok: 密码已重置，请使用新密码重新登录');
	} catch (error) {
		if (error instanceof ServiceError) return textErrorResponse(error.message);
		return textErrorResponse('请求参数错误');
	}
};
