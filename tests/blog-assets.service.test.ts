import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { createPost, updatePost } from '../src/services/content.service';
import { cleanupExpiredUploadReservations } from '../src/lib/upload';
import { getVisibleMedia } from '../src/services/media-access.service';
import { parsePostMediaSnapshot } from '../src/lib/post';
import { contentDisposition, readStoredFile } from '../src/lib/media-file';

let sequence = 0;
async function createUser(prefix: string) {
	const username = `${prefix}_${sequence++}`;
	return prisma.user.create({
		data: {
			username,
			displayName: username,
			email: `${username}@example.test`,
			passwordHash: 'hash'
		}
	});
}

async function reserve(
	userId: string,
	fileType: 'image' | 'attachment',
	options: { expired?: boolean; size?: number } = {}
) {
	const file = await prisma.fileStorage.create({
		data: {
			md5Hash: `asset-${sequence++}`,
			filePath: `${fileType}s/missing-${sequence}.bin`,
			fileSize: options.size ?? 128,
			mimeType: fileType === 'image' ? 'image/png' : 'application/pdf',
			fileType,
			refCount: 1
		}
	});
	const reservation = await prisma.uploadReservation.create({
		data: {
			userId,
			fileStorageId: file.id,
			originalName: fileType === 'image' ? 'cover.png' : 'guide.pdf',
			fileType,
			expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 86_400_000))
		}
	});
	return { file, reservation };
}

after(async () => prisma.$disconnect());

test('版本快照读取同时兼容旧数组和 v2 对象', () => {
	assert.deepEqual(parsePostMediaSnapshot('["legacy-media"]'), {
		version: 2,
		bodyMediaIds: ['legacy-media'],
		thumbnailMediaId: null,
		attachmentMediaIds: []
	});
	assert.deepEqual(
		parsePostMediaSnapshot(
			JSON.stringify({
				version: 2,
				bodyMediaIds: ['body'],
				thumbnailMediaId: 'thumbnail',
				attachmentMediaIds: ['attachment']
			})
		),
		{
			version: 2,
			bodyMediaIds: ['body'],
			thumbnailMediaId: 'thumbnail',
			attachmentMediaIds: ['attachment']
		}
	);
});

test('下载文件名响应头拒绝注入，存储读取拒绝路径逃逸', async () => {
	const header = contentDisposition('报告\r\nX-Evil: yes.pdf');
	assert.equal(header.includes('\r'), false);
	assert.equal(header.includes('\n'), false);
	assert.match(header, /filename\*=UTF-8''/);
	assert.equal(await readStoredFile('../../etc/passwd'), null);
});

test('博客创建原子消费缩略图和附件 reservation，并生成分槽媒体', async () => {
	const author = await createUser('asset_author');
	const thumbnail = await reserve(author.id, 'image');
	const attachment = await reserve(author.id, 'attachment');

	const post = await createPost({
		userId: author.id,
		mode: 'blog',
		title: '资产闭环',
		content: '正文',
		thumbnailFileStorageId: thumbnail.file.id,
		attachmentFileStorageIds: [attachment.file.id]
	});
	const media = await prisma.media.findMany({ where: { postId: post.id } });
	assert.equal(media.length, 2);
	assert.equal(media.find((item) => item.slot === 'thumbnail')?.fileType, 'image');
	assert.equal(media.find((item) => item.fileType === 'attachment')?.originalName, 'guide.pdf');
	assert.ok(
		(
			await prisma.uploadReservation.findUniqueOrThrow({
				where: { id: thumbnail.reservation.id }
			})
		).consumedAt
	);
	assert.ok(
		(
			await prisma.uploadReservation.findUniqueOrThrow({
				where: { id: attachment.reservation.id }
			})
		).consumedAt
	);
});

test('越权、过期、非博客缩略图及附件数量上限均由服务端拒绝', async () => {
	const owner = await createUser('asset_owner');
	const attacker = await createUser('asset_attacker');
	const foreign = await reserve(owner.id, 'image');
	await assert.rejects(
		createPost({
			userId: attacker.id,
			mode: 'blog',
			title: '越权',
			content: '正文',
			thumbnailFileStorageId: foreign.file.id
		}),
		/不属于当前用户/
	);
	const expired = await reserve(attacker.id, 'image', { expired: true });
	await assert.rejects(
		createPost({
			userId: attacker.id,
			mode: 'blog',
			title: '过期',
			content: '正文',
			thumbnailFileStorageId: expired.file.id
		}),
		/已过期/
	);
	await assert.rejects(
		createPost({
			userId: owner.id,
			mode: 'weibo',
			content: '正文',
			thumbnailFileStorageId: foreign.file.id
		}),
		/仅博客模式/
	);
	await assert.rejects(
		createPost({
			userId: owner.id,
			mode: 'blog',
			title: '过多附件',
			content: '正文',
			attachmentFileStorageIds: Array.from({ length: 11 }, (_, index) => `missing-${index}`)
		}),
		/附件最多 10 个/
	);
});

test('编辑替换资产同时写入 v2 快照、释放旧引用且不产生负数', async () => {
	const author = await createUser('asset_editor');
	const oldAttachment = await reserve(author.id, 'attachment');
	const created = await createPost({
		userId: author.id,
		mode: 'blog',
		title: '旧标题',
		content: '旧正文',
		attachmentFileStorageIds: [oldAttachment.file.id]
	});
	const replacement = await reserve(author.id, 'attachment');
	await updatePost({
		userId: author.id,
		postId: created.id,
		mode: 'blog',
		title: '新标题',
		content: '新正文',
		attachmentFileStorageIds: [replacement.file.id]
	});
	const revision = await prisma.postRevision.findFirstOrThrow({ where: { postId: created.id } });
	assert.equal(revision.content, '旧正文');
	assert.equal(JSON.parse(revision.mediaSnapshot || '{}').version, 2);
	assert.equal(
		await prisma.fileStorage.findUnique({ where: { id: oldAttachment.file.id } }),
		null
	);
	assert.equal(
		(await prisma.fileStorage.findUniqueOrThrow({ where: { id: replacement.file.id } }))
			.refCount,
		1
	);
});

test('过期清理幂等释放引用，媒体可见性与文章规则一致', async () => {
	const author = await createUser('asset_visibility_author');
	const viewer = await createUser('asset_visibility_viewer');
	const expired = await reserve(author.id, 'attachment', { expired: true });
	assert.ok((await cleanupExpiredUploadReservations()) >= 1);
	assert.equal(await cleanupExpiredUploadReservations(), 0);
	assert.equal(await prisma.fileStorage.findUnique({ where: { id: expired.file.id } }), null);

	const attachment = await reserve(author.id, 'attachment');
	const post = await createPost({
		userId: author.id,
		mode: 'blog',
		title: '私密附件',
		content: '正文',
		visibility: 'private',
		attachmentFileStorageIds: [attachment.file.id]
	});
	const media = await prisma.media.findFirstOrThrow({ where: { postId: post.id } });
	assert.equal(await getVisibleMedia(media.id, { userId: viewer.id, role: 'user' }), null);
	assert.ok(await getVisibleMedia(media.id, { userId: author.id, role: 'user' }));
});
