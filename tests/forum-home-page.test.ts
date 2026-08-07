import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const page = await readFile(new URL('../src/pages/forum/index.astro', import.meta.url), 'utf8');

test('论坛首页保留分级板块导览与帖子流的阅读顺序', () => {
	assert.match(page, /forum-sidebar-home/);
	assert.match(page, /href="\/forum"/);
	assert.match(page, /forum-category-overview/);
	assert.match(page, /浏览板块/);
	assert.match(page, /group\.children\.map/);
	assert.match(page, /category\.description\s*\|\|\s*'暂未添加板块介绍'/);
	assert.match(page, /forum-topic-section-title/);
	assert.match(page, /<ForumTopicList posts=\{posts\}/);
});
