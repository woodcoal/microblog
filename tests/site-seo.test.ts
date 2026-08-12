import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('注销路由在渲染前返回不含身份信息的 410 和 noindex 响应', async () => {
	const [route, profile, seo] = await Promise.all([
		read('src/pages/[username]/[postId]/index.astro'),
		read('src/pages/[username]/index.astro'),
		read('src/lib/site-seo.ts')
	]);
	assert.match(route, /resolveUsernameRoute\(Astro\.params\.username\)/);
	assert.match(route, /usernameRoute\?\.isDeleted\)[\s\S]*return goneResponse\(\)/);
	assert.match(route, /model\.isDeleted[\s\S]*return goneResponse\(\)/);
	assert.match(profile, /resolvedUsername\?\.isDeleted\)[\s\S]*return goneResponse\(\)/);
	assert.match(seo, /status: 410/);
	assert.match(seo, /X-Robots-Tag': 'noindex, nofollow, noarchive'/);
	assert.doesNotMatch(seo, /username|avatar|email/i);
});

test('公开页面自动统一 canonical、Open Graph 和 WebPage JSON-LD，私有路径不输出它们', async () => {
	const [base, postDetail] = await Promise.all([
		read('src/layouts/Base.astro'),
		read('src/lib/post-detail.ts')
	]);
	assert.match(base, /getStaticCanonicalUrl\(currentPath, Astro\.url\.search\.length > 0\)/);
	assert.match(base, /resolvedNoindex = Boolean\(noindex \|\| pathNoindex\)/);
	assert.match(base, /name="robots" content="noindex, nofollow, noarchive"/);
	assert.match(base, /'@type': 'WebPage'/);
	assert.match(base, /property="og:url" content=\{resolvedCanonicalUrl\}/);
	assert.match(postDetail, /const isNotPublic = post\.visibility !== 'public' \|\| isDeleted/);
	assert.match(postDetail, /if \(model\.isNotPublic\) return undefined/);
});

test('robots、sitemap 与站内搜索共同排除私有和已注销内容', async () => {
	const [robots, sitemap, search] = await Promise.all([
		read('src/pages/robots.txt.ts'),
		read('src/pages/sitemap.xml.ts'),
		read('src/pages/search.astro')
	]);
	for (const path of ['/search', '/bookmarks', '/blog/write', '/*/edit$', '/*/revisions$']) {
		assert.match(
			robots,
			new RegExp(`Disallow: ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
		);
	}
	assert.match(sitemap, /user: \{ deletedAt: null \}/);
	assert.match(sitemap, /visibility: 'public', isDeleted: false/);
	assert.match(sitemap, /escapeXml\(u\.loc\)/);
	assert.match(search, /deletedAt: null/);
	assert.match(search, /visibility: 'public'/);
});
