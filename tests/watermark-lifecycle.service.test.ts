import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
import { prisma } from '../src/lib/db';
import { UPLOAD_DIR } from '../src/lib/config';
import {
	cleanupWatermarkFiles,
	DEFAULT_WATERMARK_CONFIGURATION,
	renderMediaWatermark
} from '../src/services/watermark.service';

/** 水印派生文件必须独立于全局去重 FileStorage，且可在 Media 删除后单独清理。 */
test('水印渲染写入 Media 派生副本并支持独立清理', async () => {
	const suffix = crypto.randomUUID().replaceAll('-', '');
	const author = await prisma.user.create({
		data: {
			username: `watermark_${suffix}`.slice(0, 30),
			displayName: '水印作者',
			email: `${suffix}@example.test`,
			passwordHash: 'hash'
		}
	});
	const post = await prisma.post.create({
		data: { id: suffix.slice(0, 8), userId: author.id, content: '正文', mode: 'weibo' }
	});
	const sourcePath = `protected/images/original/${suffix}.png`;
	await mkdir(join(UPLOAD_DIR, 'protected/images/original'), { recursive: true });
	await writeFile(
		join(UPLOAD_DIR, sourcePath),
		await sharp({ create: { width: 80, height: 40, channels: 3, background: '#123456' } })
			.png()
			.toBuffer()
	);
	const file = await prisma.fileStorage.create({
		data: {
			md5Hash: suffix,
			filePath: sourcePath,
			fileSize: 1,
			mimeType: 'image/png',
			fileType: 'image',
			refCount: 1
		}
	});
	const media = await prisma.media.create({
		data: { postId: post.id, fileStorageId: file.id, fileType: 'image' }
	});
	await renderMediaWatermark({
		mediaId: media.id,
		filePath: sourcePath,
		configuration: { ...DEFAULT_WATERMARK_CONFIGURATION, enabled: true },
		username: author.username,
		nickname: author.displayName,
		publishedAt: post.createdAt
	});
	const rendered = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
	assert.match(rendered.watermarkFilePath || '', /^protected\/images\/watermark-v1\/.+\.webp$/);
	assert.equal(rendered.watermarkMimeType, 'image/webp');
	assert.equal(existsSync(join(UPLOAD_DIR, rendered.watermarkFilePath!)), true);
	await cleanupWatermarkFiles([rendered.watermarkFilePath]);
	assert.equal(existsSync(join(UPLOAD_DIR, rendered.watermarkFilePath!)), false);
});

after(async () => prisma.$disconnect());
