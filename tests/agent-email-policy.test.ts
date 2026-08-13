import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { setEmailOwnershipEnabled } from '../src/services/email-policy.service';
import { POST as forgotPassword } from '../src/pages/api/agent/forgot-password';
import { POST as resetPassword } from '../src/pages/api/agent/reset-password';
import { POST as resendVerification } from '../src/pages/api/agent/resend-verification';
import { POST as verifyEmail } from '../src/pages/api/agent/verify-email';

after(async () => {
	await setEmailOwnershipEnabled(true);
	await prisma.$disconnect();
});

function request(body: Record<string, string>): Request {
	return new Request('http://localhost/api/agent/test', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

test('邮箱所有权关闭时 Agent 四个入口返回精确文案', async () => {
	await setEmailOwnershipEnabled(false);
	const cases: Array<[Response | Promise<Response>, string]> = [
		[
			forgotPassword({ request: request({ email: 'user@example.test' }) } as never),
			'联系管理员处理'
		],
		[
			resetPassword({
				request: request({ token: 'token', password: 'password123' })
			} as never),
			'联系管理员处理'
		],
		[
			resendVerification({ request: request({ email: 'user@example.test' }) } as never),
			'与管理员联系处理'
		],
		[verifyEmail({ request: request({ token: 'token' }) } as never), '与管理员联系处理']
	];
	for (const [responsePromise, message] of cases) {
		const response = await responsePromise;
		assert.equal(response.status, 403);
		assert.equal(await response.text(), `error: ${message}`);
	}
});
