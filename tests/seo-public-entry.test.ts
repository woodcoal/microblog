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
	assert.match(base, /const shouldNoindex = Boolean\(noindex\) \|\| isPrivateSurface/);
	assert.match(
		base,
		/const resolvedCanonicalUrl = shouldNoindex[\s\S]*canonicalUrl \?\? new URL\(currentPath, SITE_URL\)/
	);
	assert.match(
		base,
		/resolvedCanonicalUrl && <link rel="canonical" href=\{resolvedCanonicalUrl\} \/>/
	);
	assert.match(
		base,
		/resolvedCanonicalUrl && <meta property="og:url" content=\{resolvedCanonicalUrl\} \/>/
	);
	assert.match(base, /const resolvedJsonLd = shouldNoindex[\s\S]*: \(jsonLd \?\? \{/);
	assert.match(base, /url: resolvedCanonicalUrl/);
	assert.match(profile, /canonicalUrl=\{`\$\{SITE_URL\}\/\$\{user\.username\}`\}/);
	assert.match(profile, /url: `\$\{SITE_URL\}\/\$\{user\.username\}`/);
	assert.match(
		detail,
		/const canonicalUrl = getCanonicalUrl\(`\/\$\{post\.user\.username\}\/\$\{post\.id\}`\)/
	);
});

test('非公开、已删除和已注销入口都有明确的 noindex 或 410 收口', async () => {
	const [seo, profile, detail, route, publicRoute, robots, sitemap] = await Promise.all([
		read('src/lib/seo.ts'),
		read('src/pages/[username]/index.astro'),
		read('src/lib/post-detail.ts'),
		read('src/pages/[username]/[postId]/index.astro'),
		read('src/lib/public-route.ts'),
		read('src/pages/robots.txt.ts'),
		read('src/pages/sitemap.xml.ts')
	]);
	assert.match(publicRoute, /status: 410/);
	assert.match(publicRoute, /'X-Robots-Tag': 'noindex, nofollow, noarchive'/);
	assert.match(profile, /isTombstonedUsername\(username\)[\s\S]*return goneResponse\(\)/);
	assert.match(profile, /accountStatus\?\.isDisabled[\s\S]*createNoindexNotFoundResponse\(\)/);
	assert.match(seo, /status: 404/);
	assert.match(seo, /'X-Robots-Tag': 'noindex, nofollow'/);
	assert.match(
		detail,
		/if \(post\.user\.deletedAt \|\| post\.isDeleted\) throw new PostDetailGoneError\(\)/
	);
	assert.match(
		detail,
		/if \(post\.user\.isDisabled\) throw new PostDetailNoindexNotFoundError\(\)/
	);
	assert.match(route, /error instanceof PostDetailGoneError/);
	assert.match(route, /error instanceof PostDetailNoindexNotFoundError/);
	assert.match(detail, /const isNotPublic = post\.visibility !== 'public' \|\| isDeleted/);
	assert.match(detail, /if \(model\.isNotPublic\) return undefined/);
	assert.match(robots, /Disallow: \/search/);
	assert.match(robots, /Disallow: \/settings/);
	assert.match(sitemap, /user: \{ deletedAt: null, isDisabled: false \}/);
	assert.match(sitemap, /loc: `\$\{SITE_URL\}\/\$\{post\.user\.username\}\/\$\{post\.id\}`/);
});
