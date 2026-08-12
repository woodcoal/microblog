import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import {
	generateToken,
	getUserFromBearerRequest,
	hashPassword,
	verifyPassword
} from '../src/lib/auth';
import { hashToken } from '../src/lib/token';
import {
	consumeEmailChangeToken,
	hashEmailChangeToken,
	issueEmailChangeToken
} from '../src/lib/email-change';
import { loginUser, requestEmailChange } from '../src/services/auth.service';

const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const password = 'email-change-old-password';
let sequence = 0;

function unique(prefix: string): string {
	sequence += 1;
	return `${prefix}_${RUN_ID.slice(-9)}${sequence}`.slice(0, 20);
}

async function createVerifiedUser() {
	const username = unique('change');
	return prisma.user.create({
		data: {
			username,
			displayName: username,
			email: `${username}@example.test`,
			passwordHash: await hashPassword(password),
			emailVerifiedAt: new Date()
		}
	});
}

async function createChangeToken(
	userId: string,
	targetEmail: string,
	expiresAt = new Date(Date.now() + 60_000)
) {
	const raw = crypto.randomUUID();
	await prisma.emailChangeToken.create({
		data: { userId, targetEmail, tokenHash: hashEmailChangeToken(raw), expiresAt }
	});
	return raw;
}

after(async () => {
	const users = await prisma.user.findMany({
		where: { username: { startsWith: 'change_' } },
		select: { id: true }
	});
	const ids = users.map((user) => user.id);
	if (ids.length) {
		await prisma.activityLog.deleteMany({ where: { actorId: { in: ids } } });
		await prisma.emailChangeToken.deleteMany({ where: { userId: { in: ids } } });
		await prisma.apiToken.deleteMany({ where: { userId: { in: ids } } });
		await prisma.webhook.deleteMany({ where: { userId: { in: ids } } });
		await prisma.user.deleteMany({ where: { id: { in: ids } } });
	}
	await prisma.$disconnect();
});

test('发起换绑需当前密码，确认前旧邮箱仍可登录，且只保存令牌摘要', async () => {
	const user = await createVerifiedUser();
	await assert.rejects(
		requestEmailChange({
			userId: user.id,
			currentPassword: 'wrong-password',
			targetEmail: 'next@example.test'
		}),
		/当前密码错误/
	);
	await requestEmailChange({
		userId: user.id,
		currentPassword: password,
		targetEmail: 'next@example.test'
	});
	const issued = await prisma.emailChangeToken.findFirstOrThrow({ where: { userId: user.id } });
	assert.equal(issued.targetEmail, 'next@example.test');
	assert.match(issued.tokenHash, /^[a-f0-9]{64}$/);
	assert.equal(
		(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
		user.email
	);
	assert.equal((await loginUser({ email: user.email, password })).id, user.id);
	await assert.rejects(loginUser({ email: 'next@example.test', password }), /邮箱或密码错误/);
});

test('并发消费只成功一次，过期、重放和竞争不换绑', async () => {
	const user = await createVerifiedUser();
	const raw = await createChangeToken(user.id, `${unique('next')}@example.test`);
	assert.deepEqual(
		(await Promise.all([consumeEmailChangeToken(raw), consumeEmailChangeToken(raw)])).sort(),
		[false, true]
	);
	assert.equal(await consumeEmailChangeToken(raw), false);

	const expired = await createChangeToken(
		user.id,
		`${unique('expired')}@example.test`,
		new Date(Date.now() - 1)
	);
	assert.equal(await consumeEmailChangeToken(expired), false);

	const owner = await createVerifiedUser();
	const competingEmail = `${unique('occupied')}@example.test`;
	await prisma.user.update({ where: { id: owner.id }, data: { email: competingEmail } });
	const race = await createChangeToken(user.id, competingEmail);
	assert.equal(await consumeEmailChangeToken(race), false);
	assert.notEqual(
		(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
		competingEmail
	);
});

test('成功换绑原子撤销 JWT、API Token、Webhook 与其他挂起链接', async () => {
	const user = await createVerifiedUser();
	const apiToken = `mt_${crypto.randomUUID().replaceAll('-', '').slice(0, 32)}`;
	await prisma.apiToken.create({
		data: { userId: user.id, name: 'old credential', tokenHash: await hashToken(apiToken) }
	});
	await prisma.webhook.create({
		data: {
			userId: user.id,
			url: 'https://example.test/hook',
			secret: 'a'.repeat(64),
			events: '[]'
		}
	});
	const jwt = await generateToken({
		userId: user.id,
		username: user.username,
		role: user.role,
		credentialVersion: 0
	});
	assert.equal(
		(
			await getUserFromBearerRequest(
				new Request('http://test', { headers: { authorization: `Bearer ${jwt}` } })
			)
		)?.userId,
		user.id
	);
	assert.equal(
		(
			await getUserFromBearerRequest(
				new Request('http://test', { headers: { authorization: `Bearer ${apiToken}` } })
			)
		)?.userId,
		user.id
	);
	const raw = await createChangeToken(user.id, `${unique('changed')}@example.test`);
	const sibling = await createChangeToken(user.id, `${unique('sibling')}@example.test`);
	assert.equal(await consumeEmailChangeToken(raw), true);
	const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.equal(updated.credentialVersion, 1);
	assert.equal(await prisma.apiToken.count({ where: { userId: user.id } }), 0);
	assert.equal(await prisma.webhook.count({ where: { userId: user.id } }), 0);
	assert.equal(
		await getUserFromBearerRequest(
			new Request('http://test', { headers: { authorization: `Bearer ${jwt}` } })
		),
		null
	);
	assert.equal(
		await getUserFromBearerRequest(
			new Request('http://test', { headers: { authorization: `Bearer ${apiToken}` } })
		),
		null
	);
	assert.ok(
		(
			await prisma.emailChangeToken.findUniqueOrThrow({
				where: { tokenHash: hashEmailChangeToken(sibling) }
			})
		).revokedAt
	);
	assert.equal(await verifyPassword(password, updated.passwordHash), true);
	assert.equal(
		await loginUser({ email: updated.email, password }).then((result) => result.id),
		user.id
	);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: user.id, action: 'auth.email_changed' }
		}),
		1
	);
});

test('重发在冷却窗口内不产生新令牌，窗口结束后会撤销旧令牌', async () => {
	const user = await createVerifiedUser();
	await issueEmailChangeToken({
		userId: user.id,
		targetEmail: `${unique('first')}@example.test`
	});
	const first = await prisma.emailChangeToken.findFirstOrThrow({ where: { userId: user.id } });
	await issueEmailChangeToken({
		userId: user.id,
		targetEmail: `${unique('second')}@example.test`
	});
	assert.equal(await prisma.emailChangeToken.count({ where: { userId: user.id } }), 1);
	await prisma.emailChangeToken.update({
		where: { id: first.id },
		data: { createdAt: new Date(Date.now() - 61_000) }
	});
	await issueEmailChangeToken({
		userId: user.id,
		targetEmail: `${unique('second')}@example.test`
	});
	assert.equal(await prisma.emailChangeToken.count({ where: { userId: user.id } }), 2);
	assert.ok(
		(await prisma.emailChangeToken.findUniqueOrThrow({ where: { id: first.id } })).revokedAt
	);
});
