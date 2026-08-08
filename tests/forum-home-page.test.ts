import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [page, categoryPage, detailPage, layout, navigation, navigationItems, topMenu, pageStyles] =
	await Promise.all([
		readFile(new URL('../src/pages/forum/index.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/forum/[slug].astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/pages/[username]/[postId]/index.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/layouts/ForumLayout.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/components/ForumNavigation.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/components/ForumNavigationItems.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/components/ForumTopMenu.astro', import.meta.url), 'utf8'),
		readFile(new URL('../src/styles/ux-pages.css', import.meta.url), 'utf8')
	]);

test('论坛首页保留分级板块导览与帖子流的阅读顺序', () => {
	assert.match(page, /forum-category-overview/);
	assert.match(page, /浏览板块/);
	assert.match(page, /group\.children\.map/);
	assert.match(page, /category\.description\s*\|\|\s*'暂未添加板块介绍'/);
	assert.match(page, /forum-topic-section-title/);
	assert.match(page, /<ForumTopicList posts=\{posts\}/);
});

test('论坛频道导航由共享布局统一提供首页、热门、推荐与板块入口', () => {
	assert.match(layout, /import ForumNavigation/);
	assert.match(layout, /<ForumNavigation \/>/);
	assert.match(navigationItems, /label: '首页'/);
	assert.match(navigationItems, /label: '热门'/);
	assert.match(navigationItems, /label: '推荐'/);
	assert.match(navigationItems, /groups\.map/);
	assert.match(navigation, /ForumNavigationItems/);
	assert.doesNotMatch(navigation, /forum-menu-disclosure/);
	assert.match(topMenu, /<ForumNavigationItems/);
	assert.match(pageStyles, /forum-top-menu/);
	assert.match(
		pageStyles,
		/\.forum-top-menu \.sidebar-link span:not\(\.sidebar-link-icon\)[\s\S]*display: inline/
	);
	assert.match(pageStyles, /\.post-detail-layout-forum > \.post-detail-primary/);
	assert.doesNotMatch(pageStyles, /\.forum-sidebar-primary h2 \{/);
	assert.match(page, /const showCategoryOverview = forumSort === 'latest'/);
	assert.match(page, /showCategoryOverview && \(/);
	assert.doesNotMatch(page, /slot="nav"/);
	assert.doesNotMatch(categoryPage, /slot="nav"/);
	assert.match(detailPage, /<ForumNavigation presentation="detail" \/>/);
	assert.match(page, /<ForumTopMenu \/>/);
	assert.match(categoryPage, /<ForumTopMenu \/>/);
	assert.match(detailPage, /<ForumTopMenu \/>/);
	assert.doesNotMatch(detailPage, /forumGroups/);
});
