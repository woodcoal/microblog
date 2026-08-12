import type { APIRoute } from 'astro';
import { resendEmailVerification } from '@/lib/email-verification';
import { handleApiError, jsonResponse, parseJsonObject, stringValue } from '@/lib/api-v1';

/** 始终返回相同成功体，防止通过邮箱存在性或验证状态枚举账号。 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseJsonObject(request);
		await resendEmailVerification(stringValue(body.email, 'email')!);
		return jsonResponse({ accepted: true, message: '若邮箱可用，验证邮件已发送' });
	} catch (error) {
		return handleApiError(error);
	}
};
