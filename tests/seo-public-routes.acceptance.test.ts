/** 生产 HTTP 回归：sitemap 中的分类 URL 必须真实可达，墓碑与未知用户名语义必须不同。 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/db';

const PORT = 4338;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const publicUsername = `seo_route_${RUN_ID}`.slice(0, 20);
const tombstonedUsername = `seo_gone_${RUN_ID}`.slice(0, 20);
const legacyTombstonedUsername = `seo_legacy_${RUN_ID}`.slice(0, 20);
const missingUsername = `seo_missing_${RUN_ID}`.slice(0, 20);
const weiboCategorySlug = `qa-weibo-${RUN_ID}`.slice(0, 40);
const blogCategorySlug = `qa-blog-${RUN_ID}`.slice(0, 40);
let publicUserId = '';
let tombstonedUserId = '';
let publicPostId = '';
let tombstonedPostId = '';
let weiboPostId = '';
let weiboCategoryId = '';
let blogCategoryId = '';

function request(path: string) {
	return fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
}

async function waitForServer(expectAvailable: boolean) {
	let lastError: unknown;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await request('/robots.txt');
			if (expectAvailable && response.status < 500) return;
		} catch (error) {
			lastError = error;
			if (!expectAvailable) return;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw lastError ?? new Error('Astro server state did not change');
}

async function stopServer() {
	if (process.platform === 'linux') {
		const result = spawnSync('fuser', ['-k', '-TERM', `${PORT}/tcp`], { stdio: 'ignore' });
		if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw result.error;
		}
	}
	await waitForServer(false);
}

before(async () => {
	await stopServer();
	const [publicUser, tombstonedUser, weiboCategory, blogCategory] = await Promise.all([
		prisma.user.create({
			data: {
				username: publicUsername,
				displayName: 'SEO 路由公开用户',
				email: `${publicUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				emailVerifiedAt: new Date()
			}
		}),
		prisma.user.create({
			data: {
				username: tombstonedUsername,
				displayName: '不得泄露的注销用户',
				email: `${tombstonedUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				deletedAt: new Date(),
				emailVerifiedAt: new Date()
			}
		}),
		prisma.category.create({
			data: { name: '微博测试分类', slug: weiboCategorySlug, mode: 'weibo' }
		}),
		prisma.category.create({
			data: { name: '博客测试分类', slug: blogCategorySlug, mode: 'blog' }
		})
	]);
	publicUserId = publicUser.id;
	tombstonedUserId = tombstonedUser.id;
	weiboCategoryId = weiboCategory.id;
	blogCategoryId = blogCategory.id;
	publicPostId = `seoroute${RUN_ID}`.slice(0, 20);
	tombstonedPostId = `seogone${RUN_ID}`.slice(0, 20);
	weiboPostId = `seoweibo${RUN_ID}`.slice(0, 20);

	await Promise.all([
		prisma.usernameClaim.create({
			data: { username: legacyTombstonedUsername, userId: tombstonedUserId }
		}),
		prisma.post.createMany({
			data: [
				{
					id: publicPostId,
					userId: publicUserId,
					content: 'Sitemap route acceptance post',
					visibility: 'public',
					mode: 'blog',
					categoryId: blogCategoryId
				},
				{
					id: weiboPostId,
					userId: publicUserId,
					content: 'Weibo category must not enter the sitemap',
					visibility: 'public',
					mode: 'weibo',
					categoryId: weiboCategoryId
				},
				{
					id: tombstonedPostId,
					userId: tombstonedUserId,
					content: 'Tombstoned post must not be visible',
					visibility: 'public'
				}
			]
		})
	]);

	const build = spawnSync('pnpm', ['run', 'build'], { env: process.env, stdio: 'inherit' });
	if (build.status !== 0) throw new Error('Production build failed');
	spawn('node', ['-r', 'dotenv/config', 'dist/server/entry.mjs'], {
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
		stdio: 'pipe',
		detached: process.platform !== 'win32'
	});
	await waitForServer(true);
});

after(async () => {
	await stopServer();
	await prisma.post.deleteMany({
		where: { id: { in: [publicPostId, tombstonedPostId, weiboPostId] } }
	});
	await prisma.usernameClaim.deleteMany({ where: { userId: tombstonedUserId } });
	await prisma.category.deleteMany({ where: { id: { in: [weiboCategoryId, blogCategoryId] } } });
	await prisma.user.deleteMany({ where: { id: { in: [publicUserId, tombstonedUserId] } } });
	await prisma.$disconnect();
});

test('未知用户名返回普通 404，而当前和历史注销路径返回无内容 410', async () => {
	const missing = await request(`/${missingUsername}`);
	assert.equal(missing.status, 404);
	assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');

	for (const path of [
		`/${tombstonedUsername}`,
		`/${legacyTombstonedUsername}`,
		`/${tombstonedUsername}/${tombstonedPostId}`
	]) {
		const response = await request(path);
		assert.equal(response.status, 410, `${path} must be gone`);
		assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
		assert.equal(await response.text(), '');
	}
});

test('sitemap 只收录已有公开分类路由，且收录的 blog 分类可达', async () => {
	const sitemap = await request('/sitemap.xml');
	assert.equal(sitemap.status, 200);
	const body = await sitemap.text();
	assert.match(body, new RegExp(`/blog/${blogCategorySlug}<`));
	assert.doesNotMatch(body, new RegExp(`/weibo/${weiboCategorySlug}<`));

	const blogCategory = await request(`/blog/${blogCategorySlug}`);
	assert.equal(blogCategory.status, 200);
});
