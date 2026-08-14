import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('已注销主页、帖子与历史用户名路由返回无身份信息的 410', async () => {
	const [profile, detail, user, route] = await Promise.all([
		read('src/pages/[username]/index.astro'),
		read('src/pages/[username]/[postId]/index.astro'),
		read('src/lib/user.ts'),
		read('src/lib/public-route.ts')
	]);
	assert.match(profile, /isTombstonedUsername\(username\)[\s\S]*return goneResponse\(\)/);
	assert.match(
		detail,
		/isTombstonedUsername\(Astro\.params\.username\)[\s\S]*return goneResponse\(\)/
	);
	assert.match(detail, /if \(model\.isDeleted\) return goneResponse\(\)/);
	assert.match(user, /UsernameClaim[\s\S]*deletedAt/);
	assert.match(route, /status: 410/);
	assert.match(route, /X-Robots-Tag': 'noindex, nofollow, noarchive'/);
	assert.match(route, /Cache-Control': 'no-store'/);
});

test('公共与私有页面的 canonical、OG、JSON-LD 和 noindex 输出互斥', async () => {
	const [base, account, admin, edit, revisions] = await Promise.all([
		read('src/layouts/Base.astro'),
		read('src/layouts/AccountLayout.astro'),
		read('src/layouts/Admin.astro'),
		read('src/pages/[username]/[postId]/edit.astro'),
		read('src/pages/[username]/[postId]/revisions.astro')
	]);
	assert.match(base, /const shouldNoindex = Boolean\(noindex\) \|\| isPrivateSurface/);
	assert.match(base, /resolvedCanonicalUrl = shouldNoindex/);
	assert.match(base, /const resolvedJsonLd = shouldNoindex/);
	assert.match(base, /const pageTitle = shouldNoindex/);
	assert.match(base, /'@type': 'WebPage'/);
	assert.match(base, /noindex, nofollow, noarchive/);
	assert.match(account, /<UserLayout title=\{title\} wide noindex>/);
	assert.match(admin, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
	assert.match(edit, /noindex/);
	assert.match(revisions, /noindex/);
});

test('robots 与 sitemap 只暴露当前公开可索引的 canonical 路径', async () => {
	const [robots, sitemap, search] = await Promise.all([
		read('src/pages/robots.txt.ts'),
		read('src/pages/sitemap.xml.ts'),
		read('src/pages/search.astro')
	]);
	for (const path of ['/search', '/login', '/register', '/reset-password', '/*/edit']) {
		assert.match(
			robots,
			new RegExp(`Disallow: ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
		);
	}
	assert.match(
		sitemap,
		/visibility: 'public',[\s\S]*isDeleted: false,[\s\S]*user: \{ deletedAt: null, isDisabled: false \}/
	);
	assert.match(sitemap, /isDisabled: false, deletedAt: null/);
	assert.match(sitemap, /isHidden: false/);
	assert.match(
		sitemap,
		/getCanonicalUrl\(u\.loc\)|getCanonicalUrl\(`\/\$\{post\.user\.username\}/
	);
	assert.match(
		search,
		/visibility: 'public',[\s\S]*isDeleted: false,[\s\S]*user: \{ deletedAt: null, isDisabled: false \}/
	);
});

test('高频页面将交互与样式迁移到独立资源文件', async () => {
	const [
		home,
		login,
		register,
		verifyEmail,
		forgotPassword,
		resetPassword,
		changeEmail,
		apiDocs
	] = await Promise.all([
		read('src/pages/index.astro'),
		read('src/pages/login.astro'),
		read('src/pages/register.astro'),
		read('src/pages/verify-email.astro'),
		read('src/pages/forgot-password.astro'),
		read('src/pages/reset-password.astro'),
		read('src/pages/change-email.astro'),
		read('src/pages/api/docs.astro')
	]);
	for (const page of [
		home,
		login,
		register,
		verifyEmail,
		forgotPassword,
		resetPassword,
		changeEmail
	]) {
		assert.match(page, /import '@\/styles\/pages\//);
		assert.match(page, /<script src="\.\.\/scripts\/pages\//);
		assert.doesNotMatch(page, /<style(?:\s|>)/);
	}
	assert.match(apiDocs, /import '@\/styles\/pages\/api-docs\.css'/);
	assert.match(apiDocs, /<script src="\.\.\/\.\.\/scripts\/pages\/api-docs\.ts"><\/script>/);
});
