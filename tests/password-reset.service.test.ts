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
	consumePasswordResetToken,
	hashPasswordResetToken,
	requestPasswordReset
} from '../src/lib/password-reset';

const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const password = 'reset-old-password';
let sequence = 0;

function unique(prefix: string): string {
	sequence += 1;
	return `${prefix}_${RUN_ID.slice(-9)}${sequence}`.slice(0, 20);
}

async function createVerifiedUser() {
	const username = unique('reset');
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

async function createResetToken(userId: string, expiresAt = new Date(Date.now() + 60_000)) {
	const raw = crypto.randomUUID();
	await prisma.passwordResetToken.create({
		data: { userId, tokenHash: hashPasswordResetToken(raw), expiresAt }
	});
	return raw;
}

after(async () => {
	const testUsers = await prisma.user.findMany({
		where: { email: { endsWith: '@example.test' }, username: { startsWith: 'reset_' } },
		select: { id: true }
	});
	const userIds = testUsers.map((user) => user.id);
	if (userIds.length) {
		await prisma.activityLog.deleteMany({ where: { actorId: { in: userIds } } });
		await prisma.apiToken.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.webhook.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
	}
	await prisma.$disconnect();
});

test('重置令牌仅保存摘要，并且不存在邮箱、限频与有效邮箱请求的外部语义均可安全接受', async () => {
	const user = await createVerifiedUser();
	await requestPasswordReset(user.email);
	const first = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
	assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
	assert.notEqual(first.tokenHash, user.email);
	await requestPasswordReset(user.email);
	assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 1);
	await assert.doesNotReject(requestPasswordReset(`missing_${RUN_ID}@example.test`));
});

test('并发消费只成功一次，过期与重放不更新密码或凭据', async () => {
	const user = await createVerifiedUser();
	const raw = await createResetToken(user.id);
	const nextHash = await hashPassword('reset-new-password');
	const attempts = await Promise.all([
		consumePasswordResetToken(raw, nextHash),
		consumePasswordResetToken(raw, nextHash)
	]);
	assert.deepEqual(attempts.sort(), [false, true]);
	assert.equal(await consumePasswordResetToken(raw, nextHash), false);
	const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.equal(await verifyPassword('reset-new-password', updated.passwordHash), true);
	assert.equal(updated.credentialVersion, 1);

	const expired = await createResetToken(user.id, new Date(Date.now() - 1));
	assert.equal(await consumePasswordResetToken(expired, nextHash), false);
});

test('成功重置原子撤销 API Token、Webhook、其余重置令牌并写入审计', async () => {
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
		credentialVersion: user.credentialVersion
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
	const raw = await createResetToken(user.id);
	const sibling = await createResetToken(user.id);
	assert.equal(
		await consumePasswordResetToken(raw, await hashPassword('another-new-password')),
		true
	);
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
			await prisma.passwordResetToken.findUniqueOrThrow({
				where: { tokenHash: hashPasswordResetToken(sibling) }
			})
		).revokedAt
	);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: user.id, action: 'auth.password_reset' }
		}),
		1
	);
});
