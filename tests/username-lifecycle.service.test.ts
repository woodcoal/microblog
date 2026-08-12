import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { registerUser } from '../src/services/auth.service';
import { renameUsername } from '../src/services/username.service';
import { resolveUsername, findMentionedUserIds } from '../src/lib/user';

const unique = (prefix: string) =>
	`${prefix}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 20);
const password = 'username-lifecycle-password';

after(async () => prisma.$disconnect());

test('缺省用户名生成唯一 u_xxxx，并将显式用户名归一化后永久占用', async () => {
	const generatedResult = await registerUser({
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.ok(generatedResult.user);
	const generated = generatedResult.user;
	assert.match(generated.username, /^u_[abcdefghjkmnpqrstuvwxyz23456789]{4}$/);

	const requested = unique('mixed').toUpperCase();
	const registeredResult = await registerUser({
		username: requested,
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.ok(registeredResult.user);
	const registered = registeredResult.user;
	assert.equal(registered.username, requested.toLowerCase());
	assert.equal(
		await prisma.usernameClaim.count({
			where: { username: registered.username, userId: registered.id }
		}),
		1
	);
});

test('自助改名只能一次；管理员改名不消耗额度；旧名保持占用且只解析为兼容路由', async () => {
	const userResult = await registerUser({
		username: unique('user'),
		email: `${unique('mail')}@example.test`,
		password
	});
	const adminResult = await registerUser({
		username: unique('admin'),
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.ok(userResult.user);
	assert.ok(adminResult.user);
	const user = userResult.user;
	const admin = adminResult.user;
	await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } });

	const firstName = unique('first');
	await renameUsername({ userId: user.id, actorId: user.id, username: firstName });
	await assert.rejects(
		renameUsername({ userId: user.id, actorId: user.id, username: unique('second') }),
		/仅可自助修改一次/
	);

	const adminName = unique('adminset');
	await renameUsername({
		userId: user.id,
		actorId: admin.id,
		username: adminName,
		isAdmin: true
	});
	const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.equal(current.username, adminName);
	assert.equal(current.hasSelfRenamed, true);

	const old = await resolveUsername(user.username);
	assert.deepEqual(old, { id: user.id, username: adminName, isLegacy: true });
	assert.deepEqual(await resolveUsername(adminName), {
		id: user.id,
		username: adminName,
		isLegacy: false
	});
	assert.equal((await findMentionedUserIds([user.username], admin.id)).length, 0);
	const collision = await registerUser({
		username: user.username,
		email: `${unique('mail')}@example.test`,
		password
	});
	assert.deepEqual(collision, { accepted: true, user: null });
	assert.equal(await prisma.usernameRenameAudit.count({ where: { userId: user.id } }), 2);
});
