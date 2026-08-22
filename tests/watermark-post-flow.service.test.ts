import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
import { prisma } from '../src/lib/db';
import { UPLOAD_DIR } from '../src/lib/config';
import { createPost, updatePost } from '../src/services/content.service';
import { GET as display } from '../src/pages/media/[mediaId]/display';
import { saveFile } from '../src/lib/upload';

let sequence = 0;

/** 每个测试资源使用独立文件名，避免文件和数据库记录相互干扰。 */
function nextId(prefix: string): string {
	return `${prefix}${Date.now()}${sequence++}`;
}

/** 创建用于发布的用户。 */
async function createAuthor() {
	const id = nextId('wmuser');
	return prisma.user.create({
		data: { username: id.slice(0, 30), displayName: '水印作者', email: `${id}@example.test`, passwordHash: 'hash' }
	});
}

/** 启用或关闭全局水印，所有字段均与生产默认契约一致。 */
async function setWatermark(enabled: boolean): Promise<void> {
	await prisma.systemConfig.upsert({
		where: { id: 'global' },
		create: {
			id: 'global',
			watermarkEnabled: enabled,
			watermarkTemplate: '{{username}} · {{nickname}} · {{publishedAt}}',
			watermarkPosition: 'bottom-right',
			watermarkOffsetX: -24,
			watermarkOffsetY: -24,
			watermarkFontSize: 24,
			watermarkColor: '#FFFFFF',
			watermarkOpacity: 0.65,
			watermarkRotation: 0,
			watermarkTiled: false
		},
		update: { watermarkEnabled: enabled }
	});
}

/** 创建已预约图片；valid=false 模拟单图源文件不可读。 */
async function reserveImage(userId: string, valid = true) {
	const id = nextId('wmimage');
	const filePath = `protected/images/original/${id}.png`;
	const displayFilePath = `protected/images/display-v1/${id}.webp`;
	if (valid) {
		await mkdir(join(UPLOAD_DIR, 'protected/images/original'), { recursive: true });
		await mkdir(join(UPLOAD_DIR, 'protected/images/display-v1'), { recursive: true });
		await writeFile(
			join(UPLOAD_DIR, filePath),
			await sharp({ create: { width: 120, height: 80, channels: 3, background: '#123456' } })
				.png()
				.toBuffer()
		);
		await writeFile(
			join(UPLOAD_DIR, displayFilePath),
			await sharp({ create: { width: 120, height: 80, channels: 3, background: '#456789' } })
				.webp()
				.toBuffer()
		);
	}
	const file = await prisma.fileStorage.create({
		data: {
			md5Hash: id,
			filePath,
			fileSize: 1,
			mimeType: 'image/png',
			fileType: 'image',
			refCount: 1,
			displayFilePath,
			displayFileSize: 1,
			displayMimeType: 'image/webp',
			displayWidth: 120,
			displayHeight: 80
		}
	});
	const reservation = await prisma.uploadReservation.create({
		data: {
			userId,
			fileStorageId: file.id,
			originalName: 'photo.png',
			fileType: 'image',
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	return { file, reservation, displayFilePath };
}

/** 公开帖子展示路由的最小 Astro 上下文。 */
function displayContext(mediaId: string) {
	return {
		params: { mediaId },
		request: new Request(`http://localhost/media/${mediaId}/display`),
		cookies: { get: () => undefined }
	} as never;
}

test('开关开启时微博、论坛、博客正文和博客缩略图生成水印，展示优先读取派生副本', async () => {
	await setWatermark(true);
	const author = await createAuthor();
	const weiboImage = await reserveImage(author.id);
	const weibo = await createPost({ userId: author.id, content: '微博', mediaIds: [weiboImage.file.id] });
	const forumImage = await reserveImage(author.id);
	const category = await prisma.category.create({
		data: { name: nextId('版块'), slug: nextId('board'), mode: 'forum' }
	});
	const forum = await createPost({
		userId: author.id,
		mode: 'forum',
		title: '论坛',
		categoryId: category.id,
		content: `正文 ![图](/media/reservations/${forumImage.reservation.id}/preview)`
	});
	const blogImage = await reserveImage(author.id);
	const thumbnail = await reserveImage(author.id);
	const blog = await createPost({
		userId: author.id,
		mode: 'blog',
		title: '博客',
		thumbnailFileStorageId: thumbnail.file.id,
		content: `正文 ![图](/media/reservations/${blogImage.reservation.id}/preview)`
	});
	for (const postId of [weibo.id, forum.id, blog.id]) {
		const media = await prisma.media.findMany({ where: { postId } });
		assert.ok(media.length > 0);
		for (const item of media) {
			assert.match(item.watermarkFilePath || '', /^protected\/images\/watermark-v1\/.+\.webp$/);
			assert.equal(existsSync(join(UPLOAD_DIR, item.watermarkFilePath!)), true);
		}
	}
	const weiboMedia = await prisma.media.findFirstOrThrow({ where: { postId: weibo.id } });
	const response = await display(displayContext(weiboMedia.id));
	assert.equal(response.headers.get('Content-Type'), 'image/webp');
	assert.deepEqual(
		new Uint8Array(await response.arrayBuffer()),
		new Uint8Array(await readFile(join(UPLOAD_DIR, weiboMedia.watermarkFilePath!)))
	);
});

test('关闭水印时创建帖子不生成派生文件', async () => {
	await setWatermark(false);
	const author = await createAuthor();
	const image = await reserveImage(author.id);
	const post = await createPost({ userId: author.id, content: '关闭', mediaIds: [image.file.id] });
	const media = await prisma.media.findFirstOrThrow({ where: { postId: post.id } });
	assert.equal(media.watermarkFilePath, null);
	assert.equal(existsSync(join(UPLOAD_DIR, `protected/images/watermark-v1/${media.id}.webp`)), false);
});

test('非发帖上传不会生成水印派生文件', async () => {
	await setWatermark(true);
	await rm(join(UPLOAD_DIR, 'protected/images/watermark-v1'), { recursive: true, force: true });
	const source = await sharp({
		create: { width: 40, height: 40, channels: 3, background: '#abcdef' }
	})
		.png()
		.toBuffer();
	const uploaded = await saveFile(
		new File([new Uint8Array(source)], 'standalone.png', { type: 'image/png' }),
		'image'
	);
	assert.equal(existsSync(join(UPLOAD_DIR, 'protected/images/watermark-v1')), false);
	assert.equal((await prisma.media.count({ where: { fileStorageId: uploaded.fileStorage.id } })), 0);
});

test('单图渲染失败不会回滚帖子或影响同帖其他图，编辑只渲染新增图并清理替换图', async () => {
	await setWatermark(true);
	const author = await createAuthor();
	const valid = await reserveImage(author.id);
	const missing = await reserveImage(author.id, false);
	const post = await createPost({
		userId: author.id,
		content: '降级',
		mediaIds: [valid.file.id, missing.file.id]
	});
	const initialMedia = await prisma.media.findMany({ where: { postId: post.id }, orderBy: { sortOrder: 'asc' } });
	assert.equal(initialMedia.length, 2);
	const rendered = initialMedia.find((media) => media.fileStorageId === valid.file.id)!;
	const failed = initialMedia.find((media) => media.fileStorageId === missing.file.id)!;
	assert.ok(rendered.watermarkFilePath);
	assert.equal(failed.watermarkFilePath, null);
	assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).id, post.id);
	const originalWatermark = await readFile(join(UPLOAD_DIR, rendered.watermarkFilePath!));
	const replacement = await reserveImage(author.id);
	await updatePost({
		userId: author.id,
		postId: post.id,
		content: '新增',
		mediaIds: [valid.file.id, replacement.file.id]
	});
	const withNewMedia = await prisma.media.findMany({ where: { postId: post.id } });
	const kept = withNewMedia.find((media) => media.fileStorageId === valid.file.id)!;
	const added = withNewMedia.find((media) => media.fileStorageId === replacement.file.id)!;
	assert.equal(kept.watermarkFilePath, rendered.watermarkFilePath);
	assert.deepEqual(await readFile(join(UPLOAD_DIR, kept.watermarkFilePath!)), originalWatermark);
	assert.ok(added.watermarkFilePath);
	await updatePost({ userId: author.id, postId: post.id, content: '替换', mediaIds: [replacement.file.id] });
	assert.equal(existsSync(join(UPLOAD_DIR, rendered.watermarkFilePath!)), false);
});

after(async () => {
	await prisma.$disconnect();
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});
