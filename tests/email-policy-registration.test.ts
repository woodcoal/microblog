import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { loginUser, registerUser } from '../src/services/auth.service';
import { setEmailOwnershipEnabled } from '../src/services/email-policy.service';
import { POST as v1Register } from '../src/pages/api/v1/auth/register';
import { POST as agentRegister } from '../src/pages/api/agent/register';

const password = 'email-policy-password';
const unique = (prefix: string) =>
	`${prefix}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 20);

after(async () => {
	await setEmailOwnershipEnabled(true);
	await prisma.$disconnect();
});

function registerRequest(username: string, email: string): Request {
	return new Request('http://localhost/api/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username, email, password })
	});
}

test('关闭邮箱所有权后普通注册不创建令牌且能登录', async () => {
	await setEmailOwnershipEnabled(false);
	// 先占用 bootstrap，确保待测账号不是免验证的首位管理员。
	await registerUser({
		username: unique('bootstrap'),
		email: `${unique('bootstrapmail')}@example.test`,
		password
	});
	const email = `${unique('service')}@example.test`;
	const registered = await registerUser({ username: unique('service'), email, password });
	assert.ok(registered.user);
	assert.equal(
		await prisma.emailVerificationToken.count({ where: { userId: registered.user.id } }),
		0
	);
	await assert.doesNotReject(loginUser({ email, password }));
});

test('关闭邮箱所有权后 v1 和 Agent 注册入口均接受普通用户', async () => {
	await setEmailOwnershipEnabled(false);
	const v1Email = `${unique('v1mail')}@example.test`;
	const v1 = await v1Register({
		request: registerRequest(unique('v1user'), v1Email)
	} as Parameters<typeof v1Register>[0]);
	assert.equal(v1.status, 202);
	assert.equal(((await v1.json()) as { nextAction: string }).nextAction, 'login');

	const agentEmail = `${unique('agentmail')}@example.test`;
	const agent = await agentRegister({
		request: registerRequest(unique('agentuser'), agentEmail)
	} as Parameters<typeof agentRegister>[0]);
	assert.equal(agent.status, 201);
	assert.match(await agent.text(), /^ok: 注册已完成\nnextAction: use_api_key\napiKey: mt_/);
	for (const email of [v1Email, agentEmail]) {
		const user = await prisma.user.findUniqueOrThrow({ where: { email } });
		assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 0);
		await assert.doesNotReject(loginUser({ email, password }));
	}
});
