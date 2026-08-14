import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [editor, card, detail, video] = await Promise.all([
	readFile(new URL('../src/components/PostEditor.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/PostCard.astro', import.meta.url), 'utf8'),
	readFile(
		new URL('../src/components/post-detail/PostDetailBody.astro', import.meta.url),
		'utf8'
	),
	readFile(new URL('../src/components/WeiboVideo.astro', import.meta.url), 'utf8')
]);

test('微博编辑器使用独立图片和视频选择器，并在混选时保留现有媒体', () => {
	assert.match(editor, /accept="image\/jpeg,image\/png,image\/gif,image\/webp"/);
	assert.match(
		editor,
		/id="video-input"[\s\S]*accept="video\/mp4"|accept="video\/mp4"[\s\S]*id="video-input"/
	);
	assert.doesNotMatch(editor, /\bcapture\b/);
	assert.match(editor, /uploadFiles\(Array\.from\(files\), 'video'\)/);
	assert.match(editor, /已选择视频，请先删除视频后再添加图片/);
	assert.match(editor, /已选择图片，请先删除图片后再添加视频/);
	assert.match(editor, /fileType: 'image' \| 'video' \| 'attachment'/);
	assert.match(editor, /mediaIds/);
	assert.match(editor, /role="alert"/);
});

test('微博视频组件显式禁止自动播放，并在列表和详情中独立渲染', () => {
	assert.match(video, /<video\s+controls\s+preload="metadata"\s+playsinline/);
	assert.doesNotMatch(video, /\bautoplay\b|\.play\s*\(/);
	assert.match(card, /<\/a>\s*\{hasImages && <WeiboMediaGallery/);
	assert.match(card, /\{video && <WeiboVideo media=\{video\} \/>\}/);
	assert.match(detail, /videos\.map\(\(media\) => <WeiboVideo media=\{media\} \/>\)/);
});

test('图片展示继续使用展示副本，Lightbox 仅按需请求原图', () => {
	assert.match(detail, /src=\{`\/media\/\$\{media\.id\}\/display`\}/);
	assert.match(detail, /data-lightbox-src=\{`\/media\/\$\{media\.id\}\/original`\}/);
});
