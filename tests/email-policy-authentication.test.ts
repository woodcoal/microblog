import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { createPrismaClient } from '../src/lib/db';
import { generateToken, getUserFromBearerRequest } from '../src/lib/auth';
import { hashToken } from '../src/lib/token';
import { getUserApiTokenCount } from '../src/services/auth.service';
import { setEmailOwnershipEnabled } from '../src/services/email-policy.service';
import { isSmtpAddressBlocked } from '../src/services/mail-delivery.service';
import { updateSystemConfiguration } from '../src/services/system-config.service';

const id = crypto.randomUUID().replaceAll('-', '');
const name = (prefix: string) => `${prefix}${id}`.slice(0, 20);

after(async () => {
	await prisma.$disconnect();
});

test('关闭邮箱所有权后，JWT、API Token 与 Agent Token 查询均接受免验证普通用户', async () => {
	const user = await prisma.user.create({
		data: {
			username: name('policyuser'),
			displayName: '邮箱策略用户',
			email: `${id}@example.test`,
			passwordHash: 'not-used',
			emailVerificationRequired: false
		}
	});
	const apiToken = `mt_${crypto.randomUUID().replaceAll('-', '')}`;
	await prisma.apiToken.create({
		data: { userId: user.id, name: 'policy', tokenHash: await hashToken(apiToken) }
	});
	await setEmailOwnershipEnabled(false);

	const jwt = await generateToken({
		userId: user.id,
		username: user.username,
		role: user.role,
		credentialVersion: user.credentialVersion
	});
	assert.equal(
		(
			await getUserFromBearerRequest(
				new Request('http://localhost', { headers: { authorization: `Bearer ${jwt}` } })
			)
		)?.userId,
		user.id
	);
	assert.equal(
		(
			await getUserFromBearerRequest(
				new Request('http://localhost', {
					headers: { authorization: `Bearer ${apiToken}` }
				})
			)
		)?.userId,
		user.id
	);
	assert.deepEqual(await getUserApiTokenCount({ email: user.email }), {
		userId: user.id,
		tokenCount: 1
	});

	await setEmailOwnershipEnabled(true);
	assert.equal(
		(
			await getUserFromBearerRequest(
				new Request('http://localhost', { headers: { authorization: `Bearer ${jwt}` } })
			)
		)?.userId,
		user.id,
		'关闭期间创建且被标记免验证的用户，重新开启后不能被锁死'
	);
});

test('系统配置、SMTP 和审计事务同时提交，并撤销旧邮箱令牌', async () => {
	const admin = await prisma.user.create({
		data: {
			username: name('policyadmin'),
			displayName: '策略管理员',
			email: `${id}.admin@example.test`,
			passwordHash: 'not-used',
			role: 'admin',
			emailVerificationRequired: false
		}
	});
	const pending = await prisma.emailVerificationToken.create({
		data: {
			userId: admin.id,
			tokenHash: crypto.randomUUID().replaceAll('-', ''),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	const result = await updateSystemConfiguration({
		userId: admin.id,
		emailOwnershipEnabled: false,
		smtp: {
			host: 'smtp.example.test',
			port: 465,
			security: 'tls',
			username: 'mailer',
			password: 'correct horse battery staple',
			fromName: '睦谈',
			fromAddress: 'no-reply@example.test'
		}
	});
	assert.equal(result.emailOwnershipEnabled, false);
	assert.equal(result.smtp.passwordConfigured, true);
	assert.ok(
		(await prisma.emailVerificationToken.findUniqueOrThrow({ where: { id: pending.id } }))
			.revokedAt
	);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: admin.id, action: 'admin.system_config_updated' }
		}),
		1
	);
	const encryptionKey = process.env.CONFIG_ENCRYPTION_KEY;
	delete process.env.CONFIG_ENCRYPTION_KEY;
	await assert.rejects(
		updateSystemConfiguration({
			userId: admin.id,
			emailOwnershipEnabled: true,
			smtp: {
				host: 'smtp.example.test',
				port: 465,
				security: 'tls',
				username: 'mailer',
				password: 'new password',
				fromName: '睦谈',
				fromAddress: 'no-reply@example.test'
			}
		}),
		/SMTP 配置无效/
	);
	if (encryptionKey === undefined) delete process.env.CONFIG_ENCRYPTION_KEY;
	else process.env.CONFIG_ENCRYPTION_KEY = encryptionKey;
	assert.equal(
		(await prisma.systemConfig.findUniqueOrThrow({ where: { id: 'global' } }))
			.emailOwnershipEnabled,
		false,
		'SMTP 保存失败时，邮箱策略不得半提交'
	);
});

test('SMTP 拦截 IPv4-mapped IPv6 与 IPv6 特殊地址，允许公开单播地址', () => {
	for (const address of [
		'::ffff:127.0.0.1',
		'::ffff:169.254.169.254',
		'::1',
		'::',
		'fe80::1',
		'febf::1',
		'fc00::1',
		'ff02::1',
		'2001:db8::1',
		'2001:10::1',
		'2001:2::1'
	]) {
		assert.equal(isSmtpAddressBlocked(address), true, address);
	}
	assert.equal(isSmtpAddressBlocked('2001:4860:4860::8888'), false);
});

test('升级迁移将无有效管理员的历史库修复为可用管理员', async () => {
	const url = `file:./.mt253-upgrade-${crypto.randomUUID()}.db`;
	const database = createPrismaClient(url);
	try {
		await database.$executeRawUnsafe(
			'CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "username" TEXT UNIQUE NOT NULL, "displayName" TEXT NOT NULL, "email" TEXT UNIQUE NOT NULL, "passwordHash" TEXT NOT NULL, "avatarUrl" TEXT NOT NULL DEFAULT \'\', "bio" TEXT NOT NULL DEFAULT \'\', "note" TEXT NOT NULL DEFAULT \'\', "role" TEXT NOT NULL DEFAULT \'user\', "isDisabled" BOOLEAN NOT NULL DEFAULT false, "deletedAt" DATETIME, "emailVerifiedAt" DATETIME, "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT true, "credentialVersion" INTEGER NOT NULL DEFAULT 0, "hasSelfRenamed" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)'
		);
		await database.user.create({
			data: {
				id: 'disabled-user',
				username: 'disabled_user',
				displayName: '已禁用用户',
				email: 'disabled@example.test',
				passwordHash: 'not-used',
				isDisabled: true
			}
		});
		await database.user.create({
			data: {
				id: 'eligible-user',
				username: 'eligible_user',
				displayName: '有效用户',
				email: 'eligible@example.test',
				passwordHash: 'not-used'
			}
		});
		await database.$executeRawUnsafe(
			'CREATE TABLE "AdminBootstrap" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
		);
		await database.$executeRawUnsafe(
			'CREATE UNIQUE INDEX "AdminBootstrap_userId_key" ON "AdminBootstrap"("userId")'
		);
		await database.adminBootstrap.create({ data: { id: 'global', userId: 'disabled-user' } });
		await database.$executeRawUnsafe(
			'UPDATE "User" SET "role" = \'admin\', "emailVerificationRequired" = false WHERE "id" = (SELECT "id" FROM "User" WHERE "isDisabled" = false AND "deletedAt" IS NULL ORDER BY "createdAt", "id" LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = \'admin\' AND "isDisabled" = false AND "deletedAt" IS NULL)'
		);
		await database.$executeRawUnsafe(
			'UPDATE "AdminBootstrap" SET "userId" = (SELECT "id" FROM "User" WHERE "role" = \'admin\' AND "isDisabled" = false AND "deletedAt" IS NULL ORDER BY "createdAt", "id" LIMIT 1) WHERE "id" = \'global\' AND EXISTS (SELECT 1 FROM "User" WHERE "role" = \'admin\' AND "isDisabled" = false AND "deletedAt" IS NULL)'
		);
		assert.equal(
			(await database.user.findUniqueOrThrow({ where: { id: 'eligible-user' } })).role,
			'admin'
		);
		assert.equal(
			(await database.adminBootstrap.findUniqueOrThrow({ where: { id: 'global' } })).userId,
			'eligible-user'
		);
	} finally {
		await database.$disconnect();
	}
});
