import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [
	shell,
	baseStyles,
	pageStyles,
	detailBody,
	weiboLayout,
	forumLayout,
	blogLayout,
	searchPage,
	notificationsPage
] = await Promise.all([
	readFile(new URL('../src/components/ChannelShell.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/styles/base.css', import.meta.url), 'utf8'),
	readFile(new URL('../src/styles/ux-pages.css', import.meta.url), 'utf8'),
	readFile(
		new URL('../src/components/post-detail/PostDetailBody.astro', import.meta.url),
		'utf8'
	),
	readFile(new URL('../src/layouts/WeiboLayout.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/layouts/ForumLayout.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/layouts/BlogLayout.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/search.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/notifications.astro', import.meta.url), 'utf8')
]);

test('共享壳以语义变体表达频道网格，并保留可访问的导航和辅助栏结构', () => {
	assert.match(shell, /'three-column' \| 'nav-main' \| 'main-aside' \| 'single'/);
	assert.match(shell, /channel-shell--\$\{variant\}/);
	assert.match(shell, /<main class="channel-shell__main layout-main">/);
	assert.match(shell, /aria-label="辅助内容"/);
	assert.doesNotMatch(shell, /ContentListShell/);
});

test('三档响应式规则保护 1024px 阅读列，搜索和通知使用单列壳', () => {
	assert.match(baseStyles, /max-width: 1500px/);
	assert.match(baseStyles, /@media \(min-width: 768px\) and \(max-width: 1023px\)/);
	assert.match(baseStyles, /@media \(max-width: 767px\)/);
	assert.match(baseStyles, /@container \(max-width: 1324px\)/);
	assert.match(
		baseStyles,
		/\.channel-shell--three-column \.channel-shell__aside,[\s\S]*?display: none/
	);
	assert.match(baseStyles, /\.channel-shell--single \{\s*max-width: 1024px/);
	assert.match(
		baseStyles,
		/\.channel-shell--three-column \{\s*grid-template-columns: var\(--layout-sidebar-width\) minmax\(0, 1fr\) 300px/
	);
	assert.doesNotMatch(
		baseStyles,
		/\.channel-shell__main \{\s*max-width: var\(--layout-content\)/
	);
	assert.doesNotMatch(shell, /layout-wide|layout-discovery-sidebar/);
	assert.doesNotMatch(pageStyles, /@media[^{]*1199px/);
	assert.doesNotMatch(pageStyles, /\.layout-wide(?:[\s.{:#])/);
	assert.match(detailBody, /\.post-detail-layout \{\s*min-width: 0;\s*width: 100%/);
	assert.doesNotMatch(detailBody, /\.post-detail-layout \{\s*display: grid/);
	assert.doesNotMatch(detailBody, /\.post-detail-layout-weibo \{\s*grid-template-columns/);
	assert.match(baseStyles, /\.channel-navigation-tooltip\[data-visible='true'\]/);
	assert.match(shell, /channel-navigation-tooltip/);
	assert.match(shell, /positionTooltip\(link\)/);
	for (const layout of [weiboLayout, forumLayout]) {
		assert.match(layout, /import ChannelShell/);
		assert.match(layout, /variant=\{hasDiscoveryAside \? 'three-column' : 'nav-main'\}/);
	}
	assert.match(blogLayout, /variant=\{detail \? 'main-aside' : hasDiscoveryAside \? 'three-column' : 'nav-main'\}/);
	assert.match(blogLayout, /preserveAsideOnTablet=\{detail\}/);
	assert.match(baseStyles, /channel-shell--main-aside\.channel-shell--preserve-aside/);
	assert.match(searchPage, /<ChannelShell variant="single">/);
	assert.match(notificationsPage, /<ChannelShell variant="single">/);
});
