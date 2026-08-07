import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [
	weiboLayout,
	weiboNavigation,
	blogLayout,
	blogNavigation,
	blogIndex,
	blogCategory,
	blogWrite
] = await Promise.all([
	readFile(new URL('../src/layouts/WeiboLayout.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/WeiboNavigation.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/layouts/BlogLayout.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/BlogNavigation.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/blog/index.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/blog/[slug].astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/blog/write.astro', import.meta.url), 'utf8')
]);

test('微博导航由共享布局统一提供', () => {
	assert.match(weiboLayout, /import WeiboNavigation/);
	assert.match(weiboLayout, /<WeiboNavigation \/>/);
	assert.match(weiboNavigation, /label: '推荐'/);
	assert.match(weiboNavigation, /label: '热门'/);
	assert.match(weiboNavigation, /label: '最新'/);
});

test('博客浏览页通过共享布局统一提供导航，编辑页保持全宽', () => {
	assert.match(blogLayout, /import BlogNavigation/);
	assert.match(blogLayout, /showNavigation = true/);
	assert.match(blogLayout, /<BlogNavigation \/>/);
	assert.match(blogNavigation, /label: '收藏'/);
	assert.match(blogNavigation, /文章分类/);
	assert.doesNotMatch(blogIndex, /slot="nav"/);
	assert.doesNotMatch(blogCategory, /slot="nav"/);
	assert.match(blogWrite, /showNavigation=\{false\}/);
});
