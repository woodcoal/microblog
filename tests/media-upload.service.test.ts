import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prisma } from '../src/lib/db';
import { cleanupUnreferencedFiles, deleteFileRef, saveFile } from '../src/lib/upload';
import {
	createWatermarkSvg,
	DEFAULT_WATERMARK_CONFIGURATION,
	escapeXml,
	interpolateWatermarkTemplate,
	previewWatermark,
	validateWatermarkConfiguration
} from '../src/services/watermark.service';

after(async () => {
	await cleanupUnreferencedFiles();
	await prisma.$disconnect();
});

test('图片上传保存私有原图和 WebP 展示副本', async () => {
	const png = await sharp({
		create: { width: 2001, height: 1000, channels: 3, background: '#246' }
	})
		.png()
		.toBuffer();
	const result = await saveFile(
		new File([new Uint8Array(png)], 'photo.png', { type: 'image/png' }),
		'image'
	);
	assert.match(result.fileStorage.filePath, /^protected\/images\/original\//);
	assert.match(
		result.fileStorage.displayFilePath || '',
		/^protected\/images\/display-v1\/.*\.webp$/
	);
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
		saveFile(
			new File([new Uint8Array(validMp4)], 'clip.mp4', { type: 'application/octet-stream' }),
			'video'
		),
		/MIME/
	);
	await assert.rejects(
		saveFile(
			new File([new Uint8Array(Buffer.from('not a video'))], 'clip.mp4', {
				type: 'video/mp4'
			}),
			'video'
		),
		/MP4/
	);
});

test('水印模板严格校验、插值和 XML 转义', () => {
	const configuration = validateWatermarkConfiguration({
		...DEFAULT_WATERMARK_CONFIGURATION,
		enabled: true,
		template: '{{username}} · {{nickname}} · {{publishedAt}}'
	});
	assert.equal(
		interpolateWatermarkTemplate(configuration.template, {
			username: '<owner>',
			nickname: 'A&B',
			publishedAt: '2026-01-02T03:04:05.000Z'
		}),
		'<owner> · A&B · 2026-01-02T03:04:05.000Z'
	);
	assert.equal(escapeXml('<owner>&'), '&lt;owner&gt;&amp;');
	assert.throws(
		() => validateWatermarkConfiguration({ ...configuration, template: '{{unknown}}' }),
		/未知或残缺/
	);
});

test('九宫格和平铺水印可交由 Sharp 渲染预览', async () => {
	const configuration = validateWatermarkConfiguration({
		...DEFAULT_WATERMARK_CONFIGURATION,
		enabled: true,
		position: 'middle-center',
		tiled: true
	});
	assert.match(createWatermarkSvg(configuration, 'safe', 960, 540).toString(), /pattern/);
	const preview = await previewWatermark(configuration);
	assert.match(preview.dataUrl, /^data:image\/webp;base64,/);
	assert.equal(preview.width, 960);
	assert.equal(preview.height, 540);
});
