/** 真实 SSR 路由验收：覆盖私有页面 head、禁用账号和 sitemap 的同一索引策略。 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/db';
import { generateToken } from '../src/lib/auth';

const PORT = 4337;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const activeUsername = `seo_active_${RUN_ID}`.slice(0, 20);
const disabledUsername = `seo_disabled_${RUN_ID}`.slice(0, 20);
const activeDisplayName = 'SEO 活跃验收用户';
const disabledDisplayName = 'SEO 禁用验收用户';
let activeToken = '';
let activePostId = '';
let disabledPostId = '';
let activeUserId = '';
let disabledUserId = '';

function request(path: string, token?: string) {
	return fetch(`${BASE_URL}${path}`, {
		headers: token ? { cookie: `token=${token}` } : undefined,
		redirect: 'manual'
	});
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

function assertNoindexHead(html: string, route: string) {
	assert.match(
		html,
		/<meta name="robots" content="noindex, nofollow">/,
		`${route} 必须输出 noindex, nofollow`
	);
	assert.doesNotMatch(
		html,
		/<script type="application\/ld\+json">/,
		`${route} 不得输出默认 JSON-LD`
	);
}

before(async () => {
	await stopServer();
	const [active, disabled] = await Promise.all([
		prisma.user.create({
			data: {
				username: activeUsername,
				displayName: activeDisplayName,
				email: `${activeUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				emailVerifiedAt: new Date()
			}
		}),
		prisma.user.create({
			data: {
				username: disabledUsername,
				displayName: disabledDisplayName,
				email: `${disabledUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				isDisabled: true,
				emailVerifiedAt: new Date()
			}
		})
	]);
	activeUserId = active.id;
	disabledUserId = disabled.id;
	activeToken = await generateToken({
		userId: active.id,
		username: active.username,
		role: active.role,
		credentialVersion: active.credentialVersion
	});
	activePostId = `seoactive${RUN_ID}`.slice(0, 20);
	disabledPostId = `seodisabled${RUN_ID}`.slice(0, 20);
	await prisma.post.createMany({
		data: [
			{
				id: activePostId,
				userId: active.id,
				content: 'SEO active public post',
				visibility: 'public'
			},
			{
				id: disabledPostId,
				userId: disabled.id,
				content: 'SEO disabled public post',
				visibility: 'public'
			}
		]
	});

	spawn('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
		env: { ...process.env },
		stdio: 'pipe',
		detached: process.platform !== 'win32'
	});
	await waitForServer(true);
});

after(async () => {
	await stopServer();
	await prisma.post.deleteMany({ where: { id: { in: [activePostId, disabledPostId] } } });
	await prisma.user.deleteMany({ where: { id: { in: [activeUserId, disabledUserId] } } });
	await prisma.$disconnect();
});

test('已认证的编辑、修订和写作页在真实 SSR 输出 noindex', async () => {
	for (const route of [
		`/${activeUsername}/${activePostId}/edit`,
		`/${activeUsername}/${activePostId}/revisions`,
		'/blog/write'
	]) {
		const response = await request(route, activeToken);
		assert.equal(response.status, 200, `${route} 应在认证后可访问`);
		assertNoindexHead(await response.text(), route);
	}
});

test('禁用账号不可索引且 sitemap 只收录活跃账号及其公开帖子', async () => {
	const profile = await request(`/${disabledUsername}`);
	assert.equal(profile.status, 404);
	assert.equal(profile.headers.get('x-robots-tag'), 'noindex, nofollow');
	const profileBody = await profile.text();
	assert.doesNotMatch(profileBody, new RegExp(disabledUsername));
	assert.doesNotMatch(profileBody, new RegExp(disabledDisplayName));

	const post = await request(`/${disabledUsername}/${disabledPostId}`);
	assert.equal(post.status, 404);
	assert.equal(post.headers.get('x-robots-tag'), 'noindex, nofollow');
	assert.doesNotMatch(await post.text(), new RegExp(disabledUsername));

	const sitemap = await request('/sitemap.xml');
	assert.equal(sitemap.status, 200);
	const sitemapBody = await sitemap.text();
	assert.match(sitemapBody, new RegExp(`/${activeUsername}(?:<|/)`));
	assert.match(sitemapBody, new RegExp(`/${activeUsername}/${activePostId}<`));
	assert.doesNotMatch(sitemapBody, new RegExp(disabledUsername));
	assert.doesNotMatch(sitemapBody, new RegExp(disabledPostId));
});
