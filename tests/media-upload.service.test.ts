import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prisma } from '../src/lib/db';
import { cleanupUnreferencedFiles, deleteFileRef, saveFile } from '../src/lib/upload';

after(async () => {
	await cleanupUnreferencedFiles();
	await prisma.$disconnect();
});

test('图片上传保存私有原图和 WebP 展示副本', async () => {
	const png = await sharp({ create: { width: 2001, height: 1000, channels: 3, background: '#246' } })
		.png()
		.toBuffer();
	const result = await saveFile(
		new File([new Uint8Array(png)], 'photo.png', { type: 'image/png' }),
		'image'
	);
	assert.match(result.fileStorage.filePath, /^protected\/images\/original\//);
	assert.match(result.fileStorage.displayFilePath || '', /^protected\/images\/display-v1\/.*\.webp$/);
	assert.equal(result.fileStorage.displayMimeType, 'image/webp');
	assert.equal(result.fileStorage.displayWidth, 1600);
	await deleteFileRef(result.fileStorage.id);
});

test('视频必须同时是 mp4 扩展、声明 MIME 和有效 ftyp', async () => {
	const validMp4 = Buffer.alloc(24);
	validMp4.writeUInt32BE(24, 0);
	validMp4.write('ftyp', 4);
	validMp4.write('isom', 8);
	validMp4.writeUInt32BE(0, 12);
	validMp4.write('isom', 16);
	validMp4.write('mp42', 20);
	const result = await saveFile(
		new File([new Uint8Array(validMp4)], 'clip.mp4', { type: 'video/mp4' }),
		'video'
	);
	assert.match(result.fileStorage.filePath, /^protected\/videos\//);
	assert.equal(result.fileStorage.mimeType, 'video/mp4');
	await deleteFileRef(result.fileStorage.id);
	await assert.rejects(
		saveFile(new File([new Uint8Array(validMp4)], 'clip.mp4', { type: 'application/octet-stream' }), 'video'),
		/MIME/
	);
	await assert.rejects(
		saveFile(
			new File([new Uint8Array(Buffer.from('not a video'))], 'clip.mp4', { type: 'video/mp4' }),
			'video'
		),
		/MP4/
	);
});
