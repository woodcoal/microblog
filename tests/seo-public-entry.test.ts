import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('公开页面使用同一 canonical URL 作为 Open Graph 与 JSON-LD 来源', async () => {
	const [base, seo, profile, detail] = await Promise.all([
		read('src/layouts/Base.astro'),
		read('src/lib/seo.ts'),
		read('src/pages/[username]/index.astro'),
		read('src/lib/post-detail.ts')
	]);
	assert.match(seo, /export function getCanonicalUrl/);
	assert.match(base, /const resolvedCanonicalUrl = canonicalUrl \|\| getCanonicalUrl/);
	assert.match(base, /<link rel="canonical" href=\{resolvedCanonicalUrl\} \/>/);
	assert.match(base, /<meta property="og:url" content=\{resolvedCanonicalUrl\} \/>/);
	assert.match(base, /url: resolvedCanonicalUrl/);
	assert.match(profile, /canonicalUrl=\{getCanonicalUrl\(`\/\$\{user\.username\}`\)\}/);
	assert.match(
		detail,
		/const canonicalUrl = getCanonicalUrl\(`\/\$\{post\.user\.username\}\/\$\{post\.id\}`\)/
	);
});

test('非公开、已删除和已注销入口都有明确的 noindex 或 410 收口', async () => {
	const [seo, profile, detail, route, robots, sitemap] = await Promise.all([
		read('src/lib/seo.ts'),
		read('src/pages/[username]/index.astro'),
		read('src/lib/post-detail.ts'),
		read('src/pages/[username]/[postId]/index.astro'),
		read('src/pages/robots.txt.ts'),
		read('src/pages/sitemap.xml.ts')
	]);
	assert.match(seo, /status: 410/);
	assert.match(seo, /'X-Robots-Tag': 'noindex, nofollow'/);
	assert.match(profile, /if \(accountStatus\?\.deletedAt\) \{[\s\S]*createGoneResponse\(\)/);
	assert.match(
		detail,
		/if \(post\.user\.deletedAt \|\| post\.isDeleted\) throw new PostDetailGoneError\(\)/
	);
	assert.match(route, /error instanceof PostDetailGoneError/);
	assert.match(detail, /const isNotPublic = post\.visibility !== 'public' \|\| isDeleted/);
	assert.match(detail, /if \(model\.isNotPublic\) return undefined/);
	assert.match(robots, /Disallow: \/search/);
	assert.match(robots, /Disallow: \/settings/);
	assert.match(sitemap, /user: \{ deletedAt: null, isDisabled: false \}/);
	assert.match(sitemap, /getCanonicalUrl\(`\/\$\{post\.user\.username\}\/\$\{post\.id\}`\)/);
});

test('公开内容入口同时排除已注销与禁用账号', async () => {
	const [post, recommend, search, weibo, latest, forum, blog, tag] = await Promise.all([
		read('src/lib/post.ts'),
		read('src/services/recommend.service.ts'),
		read('src/pages/search.astro'),
		read('src/pages/weibo.astro'),
		read('src/pages/latest.astro'),
		read('src/pages/forum/index.astro'),
		read('src/pages/blog/index.astro'),
		read('src/pages/tags/[tag].astro')
	]);
	for (const source of [post, recommend, search, weibo, latest, forum, blog, tag]) {
		assert.match(source, /user: \{ deletedAt: null, isDisabled: false \}/);
	}
});
