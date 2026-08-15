import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { generateShortId } from '../src/lib/shortid';
import { buildNotificationWebhookPayload } from '../src/lib/notification';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { triggerWebhooks } from '../src/lib/webhook';

const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdCommentIds: string[] = [];

async function createUser(prefix: string) {
	const user = await prisma.user.create({
		data: {
			username: `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 20),
			displayName: `${prefix} 展示名`,
			email: `${crypto.randomUUID()}@example.test`,
			passwordHash: 'test-password-hash',
			avatarUrl: '/media/avatars/avatar-file-id'
		}
	});
	createdUserIds.push(user.id);
	return user;
}

after(async () => {
	if (createdCommentIds.length)
		await prisma.comment.deleteMany({ where: { id: { in: createdCommentIds } } });
	if (createdPostIds.length)
		await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
	if (createdUserIds.length)
		await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
	await prisma.$disconnect();
});

test('评论通知Webhook包含可展示快照和稳定相对链接', async () => {
	const [actor, recipient] = await Promise.all([createUser('actor'), createUser('recipient')]);
	const post = await prisma.post.create({
		data: {
			id: generateShortId(),
			userId: recipient.id,
			content: '帖子正文不应出现在 Webhook 中',
			visibility: 'public'
		}
	});
	createdPostIds.push(post.id);
	const comment = await prisma.comment.create({
		data: { userId: actor.id, postId: post.id, content: '评论正文快照' }
	});
	createdCommentIds.push(comment.id);
	const createdAt = new Date('2026-08-15T09:00:00.000Z');

	const payload = await buildNotificationWebhookPayload({
		id: 'notification-id',
		type: 'comment',
		actorId: actor.id,
		recipientId: recipient.id,
		postId: post.id,
		commentId: comment.id,
		createdAt
	});

	assert.deepEqual(payload, {
		schemaVersion: 1,
		id: 'notification-id',
		event: 'notification.comment',
		occurredAt: createdAt.toISOString(),
		data: {
			notification: {
				id: 'notification-id',
				type: 'comment',
				createdAt: createdAt.toISOString()
			},
			actor: {
				id: actor.id,
				username: actor.username,
				displayName: actor.displayName,
				avatarUrl: actor.avatarUrl
			},
			post: { id: post.id, title: null, url: `/${recipient.username}/${post.id}` },
			comment: {
				id: comment.id,
				content: '评论正文快照',
				parentId: null,
				url: `/${recipient.username}/${post.id}#comment-${comment.id}`
			}
		}
	});
});

test('已删除内容不会被Webhook快照重新泄露', async () => {
	const [actor, recipient] = await Promise.all([
		createUser('deleteactor'),
		createUser('deletereceiver')
	]);
	const post = await prisma.post.create({
		data: {
			id: generateShortId(),
			userId: recipient.id,
			content: '已删除帖子正文',
			visibility: 'public',
			isDeleted: true
		}
	});
	createdPostIds.push(post.id);
	const comment = await prisma.comment.create({
		data: { userId: actor.id, postId: post.id, content: '已删除评论正文', isDeleted: true }
	});
	createdCommentIds.push(comment.id);

	const payload = await buildNotificationWebhookPayload({
		id: 'deleted-notification-id',
		type: 'comment',
		actorId: actor.id,
		recipientId: recipient.id,
		postId: post.id,
		commentId: comment.id,
		createdAt: new Date('2026-08-15T09:00:00.000Z')
	});

	assert.ok(payload);
	assert.deepEqual(Object.keys(payload.data).sort(), ['actor', 'notification']);
});

test('接收者无权查看私密帖子时Webhook不包含帖子或评论正文', async () => {
	const [actor, author, recipient] = await Promise.all([
		createUser('privateactor'),
		createUser('privateauthor'),
		createUser('privaterecipient')
	]);
	const post = await prisma.post.create({
		data: {
			id: generateShortId(),
			userId: author.id,
			content: '私密帖子正文',
			visibility: 'private'
		}
	});
	createdPostIds.push(post.id);
	const comment = await prisma.comment.create({
		data: { userId: actor.id, postId: post.id, content: '私密评论正文' }
	});
	createdCommentIds.push(comment.id);
	const payload = await buildNotificationWebhookPayload({
		id: 'private-notification-id',
		type: 'comment',
		actorId: actor.id,
		recipientId: recipient.id,
		postId: post.id,
		commentId: comment.id,
		createdAt: new Date('2026-08-15T09:00:00.000Z')
	});

	assert.ok(payload);
	assert.deepEqual(Object.keys(payload.data).sort(), ['actor', 'notification']);
});

test('Webhook以原始请求体签名，且仅以HTTP状态判定投递结果', async () => {
	const recipient = await createUser('deliveryrecipient');
	const secret = 'ab'.repeat(32);
	const received = Promise.withResolvers<{
		body: string;
		headers: Record<string, string | string[] | undefined>;
	}>();
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => {
			received.resolve({
				body: Buffer.concat(chunks).toString('utf8'),
				headers: request.headers
			});
			response.writeHead(204).end();
		});
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const webhook = await prisma.webhook.create({
		data: {
			userId: recipient.id,
			url: `http://127.0.0.1:${address.port}/hook`,
			secret,
			events: JSON.stringify(['notification.follow'])
		}
	});
	const payload = {
		schemaVersion: 1 as const,
		id: 'delivery-notification-id',
		event: 'notification.follow',
		occurredAt: '2026-08-15T09:00:00.000Z',
		data: {
			notification: {
				id: 'delivery-notification-id',
				type: 'follow',
				createdAt: '2026-08-15T09:00:00.000Z'
			},
			actor: { id: 'actor-id', username: 'actor', displayName: 'Actor', avatarUrl: null }
		}
	};

	try {
		await triggerWebhooks(recipient.id, payload.event, payload);
		const request = await received.promise;
		const expectedSignature = `sha256=${createHmac('sha256', Buffer.from(secret, 'hex'))
			.update(request.body)
			.digest('hex')}`;
		assert.equal(request.headers['x-webhook-id'], payload.id);
		assert.equal(request.headers['x-webhook-timestamp'], payload.occurredAt);
		assert.equal(request.headers['x-webhook-signature'], expectedSignature);
		assert.deepEqual(JSON.parse(request.body), payload);
	} finally {
		await prisma.webhook.delete({ where: { id: webhook.id } });
		server.close();
		await once(server, 'close');
	}
});
