import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { deleteAccount } from '../src/services/account-deletion.service';
import {
	getPostComments,
	getPublicPost,
	getPublicPosts,
	getUser
} from '../src/services/api-v1.service';
import { generateToken, getUserFromBearerRequest, hashPassword } from '../src/lib/auth';
import { hashToken } from '../src/lib/token';

const runId = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const password = 'permanent-delete-password';
let sequence = 0;
const createdUserIds: string[] = [];

function unique(prefix: string): string {
	sequence += 1;
	return `${prefix}_${runId.slice(-9)}${sequence}`.slice(0, 20);
}

async function createVerifiedUser(prefix: string) {
	const username = unique(prefix);
	const user = await prisma.user.create({
		data: {
			username,
			displayName: username,
			email: `${username}@example.test`,
			passwordHash: await hashPassword(password),
			emailVerifiedAt: new Date()
		}
	});
	createdUserIds.push(user.id);
	return user;
}

after(async () => {
	if (createdUserIds.length) {
		await prisma.activityLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
		await prisma.apiToken.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.webhook.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.emailChangeToken.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.emailVerificationToken.deleteMany({
			where: { userId: { in: createdUserIds } }
		});
		await prisma.comment.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.post.deleteMany({ where: { userId: { in: createdUserIds } } });
		await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
	}
	await prisma.$disconnect();
});

test('永久注销原子下线内容、保留身份并即时撤销 JWT、API Token 与链接', async () => {
	const deleted = await createVerifiedUser('deleted');
	const host = await createVerifiedUser('host');
	const publicPost = await prisma.post.create({
		data: {
			id: unique('post'),
			userId: deleted.id,
			content: 'should disappear',
			visibility: 'public'
		}
	});
	const hostPost = await prisma.post.create({
		data: {
			id: unique('post'),
			userId: host.id,
			content: 'still visible',
			visibility: 'public'
		}
	});
	await prisma.comment.create({
		data: { postId: hostPost.id, userId: deleted.id, content: 'keep floor' }
	});
	const apiToken = `mt_${crypto.randomUUID().replaceAll('-', '').slice(0, 32)}`;
	await prisma.apiToken.create({
		data: { userId: deleted.id, name: 'old credential', tokenHash: await hashToken(apiToken) }
	});
	await prisma.webhook.create({
		data: {
			userId: deleted.id,
			url: 'https://example.test/hook',
			secret: 'a'.repeat(64),
			events: '[]'
		}
	});
	await prisma.passwordResetToken.create({
		data: {
			userId: deleted.id,
			tokenHash: '1'.repeat(64),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	await prisma.emailChangeToken.create({
		data: {
			userId: deleted.id,
			targetEmail: 'future@example.test',
			tokenHash: '2'.repeat(64),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	const jwt = await generateToken({
		userId: deleted.id,
		username: deleted.username,
		role: deleted.role,
		credentialVersion: deleted.credentialVersion
	});

	assert.equal(await deleteAccount({ userId: deleted.id, currentPassword: password }), undefined);
	const tombstone = await prisma.user.findUniqueOrThrow({ where: { id: deleted.id } });
	assert.equal(tombstone.isDisabled, true);
	assert.ok(tombstone.deletedAt);
	assert.equal(tombstone.username, deleted.username);
	assert.equal(tombstone.email, deleted.email);
	assert.equal(
		(await prisma.post.findUniqueOrThrow({ where: { id: publicPost.id } })).isDeleted,
		true
	);
	assert.equal(await prisma.apiToken.count({ where: { userId: deleted.id } }), 0);
	assert.equal(await prisma.webhook.count({ where: { userId: deleted.id } }), 0);
	assert.ok(
		(
			await prisma.passwordResetToken.findUniqueOrThrow({
				where: { tokenHash: '1'.repeat(64) }
			})
		).revokedAt
	);
	assert.ok(
		(await prisma.emailChangeToken.findUniqueOrThrow({ where: { tokenHash: '2'.repeat(64) } }))
			.revokedAt
	);
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
	await assert.rejects(getPublicPost(publicPost.id), /帖子不存在/);
	await assert.rejects(getUser(deleted.username), /用户不存在/);
	assert.equal(
		(await getPublicPosts({ page: 1, pageSize: 50 })).items.some((p) => p.id === publicPost.id),
		false
	);
	const comments = await getPostComments(hostPost.id, { page: 1, pageSize: 20 });
	assert.deepEqual(comments.items[0]?.author, {
		id: 'deleted-user',
		username: 'deleted-user',
		displayName: '已注销用户',
		avatarUrl: null,
		bio: null,
		postCount: 0,
		followerCount: 0,
		followingCount: 0,
		following: false,
		createdAt: comments.items[0]?.createdAt
	});
	await assert.rejects(
		deleteAccount({ userId: deleted.id, currentPassword: password }),
		/请先登录/
	);
});

test('并发注销仅一项事务可完成', async () => {
	const user = await createVerifiedUser('race');
	const results = await Promise.allSettled([
		deleteAccount({ userId: user.id, currentPassword: password }),
		deleteAccount({ userId: user.id, currentPassword: password })
	]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: user.id, action: 'auth.account_deleted' }
		}),
		1
	);
});
