import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import {
	hashEmailVerificationToken,
	consumeEmailVerificationToken
} from '../src/lib/email-verification';
import { registerUser, loginUser } from '../src/services/auth.service';

const unique = (prefix: string) =>
	`${prefix}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 20);
const password = 'email-verification-password';

after(async () => prisma.$disconnect());

test('注册只创建待验证账号和安全摘要；单次消费后才允许登录', async () => {
	const registered = await registerUser({
		username: unique('mailuser'),
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.equal(registered.accepted, true);
	assert.ok(registered.user);
	const user = registered.user;
	const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.equal(persisted.emailVerifiedAt, null);
	const issued = await prisma.emailVerificationToken.findFirstOrThrow({
		where: { userId: user.id }
	});
	assert.match(issued.tokenHash, /^[a-f0-9]{64}$/);
	await assert.rejects(loginUser({ email: persisted.email, password }), /请先完成邮箱验证/);

	const rawToken = crypto.randomUUID();
	await prisma.emailVerificationToken.create({
		data: {
			userId: user.id,
			tokenHash: hashEmailVerificationToken(rawToken),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	assert.equal(await consumeEmailVerificationToken(rawToken), true);
	assert.equal(await consumeEmailVerificationToken(rawToken), false);
	assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt);
	await assert.doesNotReject(loginUser({ email: persisted.email, password }));
});

test('过期或已撤销令牌不会激活账号', async () => {
	const registered = await registerUser({
		username: unique('expired'),
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.ok(registered.user);
	const user = registered.user;
	for (const data of [
		{ expiresAt: new Date(Date.now() - 1), revokedAt: null },
		{ expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() }
	]) {
		const rawToken = crypto.randomUUID();
		await prisma.emailVerificationToken.create({
			data: { userId: user.id, tokenHash: hashEmailVerificationToken(rawToken), ...data }
		});
		assert.equal(await consumeEmailVerificationToken(rawToken), false);
	}
	assert.equal(
		(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt,
		null
	);
});

test('并发消费同一个有效令牌只允许一个请求激活账号', async () => {
	const registered = await registerUser({
		username: unique('concurrent'),
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.ok(registered.user);
	const user = registered.user;
	const rawToken = crypto.randomUUID();
	await prisma.emailVerificationToken.create({
		data: {
			userId: user.id,
			tokenHash: hashEmailVerificationToken(rawToken),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	assert.deepEqual(
		(
			await Promise.all([
				consumeEmailVerificationToken(rawToken),
				consumeEmailVerificationToken(rawToken)
			])
		).sort(),
		[false, true]
	);
});
