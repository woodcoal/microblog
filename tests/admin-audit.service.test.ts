import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/db';
import {
	batchComments,
	batchPosts,
	batchUsers,
	executeAuditedAdminMutation,
	queryAdminAuditLogs
} from '../src/services/admin.service';

const reason = '自动化审计测试';
const request = () => randomUUID();

async function createUser(username: string, role = 'user') {
	return prisma.user.create({
		data: {
			username,
			displayName: username,
			email: `${username}@example.test`,
			passwordHash: 'hash',
			role
		}
	});
}

after(async () => prisma.$disconnect());

test('Service 双层校验拒绝非法输入与非管理员调用', async () => {
	const normal = await createUser('audit_normal');
	await assert.rejects(
		executeAuditedAdminMutation({
			action: 'user.enable',
			ids: [],
			reason,
			requestId: request(),
			operatorId: normal.id
		}),
		/ids 必须包含/
	);
	await assert.rejects(
		executeAuditedAdminMutation({
			action: 'user.enable',
			ids: [normal.id],
			reason: ' ',
			requestId: request(),
			operatorId: normal.id
		}),
		/理由长度/
	);
	await assert.rejects(
		executeAuditedAdminMutation({
			action: 'user.enable',
			ids: [normal.id],
			reason,
			requestId: 'bad',
			operatorId: normal.id
		}),
		/requestId/
	);
	await assert.rejects(
		executeAuditedAdminMutation({
			action: 'user.enable',
			ids: [normal.id],
			reason,
			requestId: request(),
			operatorId: normal.id
		}),
		/仅管理员/
	);
});

test('解锁和取消置顶按完整动作更新状态，且保留审计幂等性', async () => {
	const admin = await createUser('audit_post_state_admin', 'admin');
	const author = await createUser('audit_post_state_author');
	const post = await prisma.post.create({
		data: {
			id: 'audit-post-state',
			userId: author.id,
			content: 'post state regression',
			isLocked: true,
			isGlobalPinned: true
		}
	});

	const unlockRequestId = request();
	assert.deepEqual(
		await batchPosts({
			action: 'unlock',
			ids: [post.id],
			reason,
			requestId: unlockRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);
	assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).isLocked, false);
	assert.deepEqual(
		await batchPosts({
			action: 'unlock',
			ids: [post.id],
			reason: '同一请求重试不重复处置',
			requestId: unlockRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);

	const unpinRequestId = request();
	assert.deepEqual(
		await batchPosts({
			action: 'unpin',
			ids: [post.id],
			reason,
			requestId: unpinRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);
	assert.equal(
		(await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).isGlobalPinned,
		false
	);
	assert.deepEqual(
		await batchPosts({
			action: 'unpin',
			ids: [post.id],
			reason: '同一请求重试不重复处置',
			requestId: unpinRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);
	assert.equal(
		await prisma.adminAuditLog.count({
			where: { operatorId: admin.id, requestId: { in: [unlockRequestId, unpinRequestId] } }
		}),
		2
	);
});

test('九类处置原子审计、幂等、回滚、筛选与复合游标均成立', async () => {
	const admin = await createUser('audit_admin', 'admin');
	const target = await createUser('audit_target');
	const post = await prisma.post.create({
		data: { id: 'auditp01', userId: target.id, content: 'audit post' }
	});
	const comment = await prisma.comment.create({
		data: { postId: post.id, userId: target.id, content: 'audit comment' }
	});

	const disableRequestId = request();
	assert.deepEqual(
		await batchUsers({
			action: 'disable',
			ids: [target.id, target.id],
			reason,
			requestId: disableRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);
	assert.deepEqual(
		await batchUsers({
			action: 'disable',
			ids: [target.id],
			reason: '重试理由不会重复执行',
			requestId: disableRequestId,
			operatorId: admin.id
		}),
		{ affected: 1 }
	);
	assert.equal(
		await prisma.adminAuditLog.count({
			where: { operatorId: admin.id, requestId: disableRequestId }
		}),
		1
	);

	await batchUsers({
		action: 'enable',
		ids: [target.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'delete',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'restore',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'lock',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'unlock',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'pin',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchPosts({
		action: 'unpin',
		ids: [post.id],
		reason,
		requestId: request(),
		operatorId: admin.id
	});
	await batchComments({ ids: [comment.id], reason, requestId: request(), operatorId: admin.id });

	const logs = await prisma.adminAuditLog.findMany({
		where: { operatorId: admin.id },
		include: { targets: true }
	});
	assert.equal(logs.length, 9);
	assert.deepEqual(
		new Set(logs.map((log) => log.action)),
		new Set([
			'user.disable',
			'user.enable',
			'post.delete',
			'post.restore',
			'post.lock',
			'post.unlock',
			'post.pin',
			'post.unpin',
			'comment.delete'
		])
	);
	assert.ok(logs.every((log) => log.targets.length === log.requestedCount));

	const firstPage = await queryAdminAuditLogs({
		operatorId: admin.id,
		targetType: 'post',
		targetId: post.id,
		limit: 2
	});
	assert.equal(firstPage.items.length, 2);
	assert.ok(firstPage.nextCursor);
	const secondPage = await queryAdminAuditLogs({
		operatorId: admin.id,
		targetType: 'post',
		targetId: post.id,
		limit: 2,
		cursor: firstPage.nextCursor!
	});
	assert.equal(secondPage.items.length, 2);
	assert.ok(!('email' in firstPage.items[0].operator));
	assert.ok(!('content' in firstPage.items[0]));

	const rollbackTarget = await createUser('audit_rollback');
	await prisma.$executeRawUnsafe(
		`CREATE TRIGGER "AdminAuditLog_fail_insert" BEFORE INSERT ON "AdminAuditLog" BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`
	);
	await assert.rejects(
		batchUsers({
			action: 'disable',
			ids: [rollbackTarget.id],
			reason,
			requestId: request(),
			operatorId: admin.id
		})
	);
	await prisma.$executeRawUnsafe(`DROP TRIGGER "AdminAuditLog_fail_insert"`);
	assert.equal(
		(await prisma.user.findUniqueOrThrow({ where: { id: rollbackTarget.id } })).isDisabled,
		false
	);
});

test('媒体 slot 唯一约束允许多个 null，但拒绝同帖第二张缩略图', async () => {
	const author = await createUser('audit_media_author');
	const post = await prisma.post.create({
		data: { id: 'auditm01', userId: author.id, content: 'media', mode: 'blog' }
	});
	const files = await Promise.all(
		[0, 1, 2, 3].map((index) =>
			prisma.fileStorage.create({
				data: {
					md5Hash: `audit-hash-${index}`,
					filePath: `/audit-${index}.png`,
					fileSize: 1,
					mimeType: 'image/png'
				}
			})
		)
	);
	await prisma.media.create({ data: { postId: post.id, fileStorageId: files[0].id } });
	await prisma.media.create({ data: { postId: post.id, fileStorageId: files[1].id } });
	await prisma.media.create({
		data: { postId: post.id, fileStorageId: files[2].id, slot: 'thumbnail' }
	});
	await assert.rejects(
		prisma.media.create({
			data: { postId: post.id, fileStorageId: files[3].id, slot: 'thumbnail' }
		})
	);
});

test('SQLite 触发器拒绝修改和删除审计主记录及目标明细', async () => {
	const log = await prisma.adminAuditLog.findFirstOrThrow({ include: { targets: true } });
	await assert.rejects(
		prisma.adminAuditLog.update({ where: { id: log.id }, data: { reason: '篡改' } })
	);
	await assert.rejects(
		prisma.adminAuditTarget.update({
			where: { id: log.targets[0].id },
			data: { outcome: 'unchanged' }
		})
	);
	await assert.rejects(prisma.adminAuditTarget.delete({ where: { id: log.targets[0].id } }));
	await assert.rejects(prisma.adminAuditLog.delete({ where: { id: log.id } }));
});
