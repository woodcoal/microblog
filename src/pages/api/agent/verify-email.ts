import type { APIRoute } from 'astro';
import { consumeEmailVerificationToken } from '@/lib/email-verification';
import { textErrorResponse, textResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = (await parseJsonBody(request)) as { token?: unknown };
		if (typeof body.token !== 'string' || !body.token.trim())
			return textErrorResponse('token 不能为空');
		if (!(await consumeEmailVerificationToken(body.token.trim())))
			return textErrorResponse('验证链接无效或已失效');
		return textResponse('ok: 邮箱验证成功');
	} catch {
		return textErrorResponse('请求参数错误');
	}
};
