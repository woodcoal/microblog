import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { registerUser } from '../src/services/auth.service';

const runId = crypto.randomUUID().replaceAll('-', '');
const password = 'mysql-qa-acceptance-password';
const registrationCount = 20;

after(async () => {
	await prisma.$disconnect();
});

test('20 路并发首注册只产生一个管理员且不留下半事务数据', async () => {
	const registrations = Array.from({ length: registrationCount }, (_, index) => {
		const username = `mqa${index}_${runId}`.slice(0, 20);
		return registerUser({
			username,
			displayName: username,
			email: `${username}@example.test`,
			password
		});
	});
	const results = await Promise.allSettled(registrations);
	const fulfilled = results.filter(
		(result): result is PromiseFulfilledResult<Awaited<(typeof registrations)[number]>> =>
			result.status === 'fulfilled'
	);
	const rejected = results.filter((result) => result.status === 'rejected');

	assert.equal(
		fulfilled.length,
		registrationCount,
		rejected.map((result) => result.reason).join('\n')
	);
	assert.equal(rejected.length, 0);
	assert.ok(fulfilled.every((result) => result.value.accepted && result.value.user));

	const usernames = fulfilled.map((result) => result.value.user!.username);
	const users = await prisma.user.findMany({
		where: { username: { in: usernames } },
		select: { id: true, username: true, role: true, emailVerificationRequired: true }
	});
	const claims = await prisma.usernameClaim.count({ where: { username: { in: usernames } } });
	const verificationTokens = await prisma.emailVerificationToken.count({
		where: { userId: { in: users.map((user) => user.id) }, consumedAt: null, revokedAt: null }
	});
	const bootstrap = await prisma.adminBootstrap.findUnique({ where: { id: 'global' } });

	assert.equal(users.length, registrationCount);
	assert.equal(claims, registrationCount);
	assert.equal(users.filter((user) => user.role === 'admin').length, 1);
	assert.equal(verificationTokens, registrationCount - 1);
	assert.equal(bootstrap?.userId, users.find((user) => user.role === 'admin')?.id);
	assert.equal(
		users.filter((user) => user.emailVerificationRequired).length,
		registrationCount - 1
	);

	console.log(
		`MySQL 20 路首注册：fulfilled=${fulfilled.length}, users=${users.length}, admins=${users.filter((user) => user.role === 'admin').length}`
	);
});
