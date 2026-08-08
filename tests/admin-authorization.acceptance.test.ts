/**
 * 管理后台 SSR 授权回归测试。
 *
 * 直接访问每个后台路由，覆盖未登录、普通用户和管理员三种身份，确保布局层不会把
 * Response 当作 Astro 组件的返回值而退化成 200 Internal server error。
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/db';
import { generateToken } from '../src/lib/auth';

const PORT = 4331;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const adminUsername = `qa_admin_${RUN_ID}`.slice(0, 20);
const userUsername = `qa_user_${RUN_ID}`.slice(0, 20);
const adminRoutes = [
	'/admin',
	'/admin/posts',
	'/admin/users',
	'/admin/comments',
	'/admin/audit',
	'/admin/tags',
	'/admin/categories',
	'/admin/site-copy'
];

let adminToken = '';
let userToken = '';
let moderatedUserId = '';

function request(path: string, token?: string) {
	return fetch(`${BASE_URL}${path}`, {
		headers: token ? { cookie: `token=${token}` } : undefined,
		redirect: 'manual'
	});
}

async function waitForServer() {
	let lastError: unknown;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await request('/');
			if (response.status < 500) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw lastError ?? new Error('Astro server did not become ready');
}

async function stopServer() {
	if (process.platform === 'linux') {
		const result = spawnSync('fuser', ['-k', '-TERM', `${PORT}/tcp`], { stdio: 'ignore' });
		if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw result.error;
		}
	}

	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			await request('/');
		} catch {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw new Error('Astro server did not stop');
}

before(async () => {
	await stopServer();
	const [admin, user] = await Promise.all([
		prisma.user.create({
			data: {
				username: adminUsername,
				displayName: 'QA 管理员',
				email: `${adminUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				role: 'admin'
			}
		}),
		prisma.user.create({
			data: {
				username: userUsername,
				displayName: 'QA 普通用户',
				email: `${userUsername}@example.test`,
				passwordHash: 'not-used-by-this-test',
				role: 'user'
			}
		})
	]);

	[adminToken, userToken] = await Promise.all([
		generateToken({ userId: admin.id, username: admin.username, role: admin.role }),
		generateToken({ userId: user.id, username: user.username, role: user.role })
	]);
	moderatedUserId = user.id;

	spawn('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
		env: { ...process.env },
		stdio: 'pipe',
		detached: process.platform !== 'win32'
	});
	await waitForServer();
});

after(async () => {
	await stopServer();
	await prisma.$disconnect();
});

test('未登录访问每个后台路由都会重定向至登录页', async () => {
	for (const route of adminRoutes) {
		const response = await request(route);
		assert.equal(response.status, 302, `${route} 应重定向`);
		assert.equal(
			response.headers.get('location'),
			`${BASE_URL}/login`,
			`${route} 应前往登录页`
		);
	}
});

test('普通用户访问每个后台路由得到不泄露后台壳的 403 页面', async () => {
	for (const route of adminRoutes) {
		const response = await request(route, userToken);
		assert.equal(response.status, 403, `${route} 应拒绝普通用户`);
		assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
		const body = await response.text();
		assert.match(body, /无权访问管理后台/);
		assert.doesNotMatch(body, /Internal server error/i);
		assert.doesNotMatch(body, /data-ux-shell="admin"/);
	}
});

test('管理员访问每个后台路由得到完整后台壳', async () => {
	for (const route of adminRoutes) {
		const response = await request(route, adminToken);
		assert.equal(response.status, 200, `${route} 应允许管理员访问`);
		const body = await response.text();
		assert.match(body, /data-ux-shell="admin"/);
	}
});

test('后台理由弹窗居中、确认后提交处置，添加用户弹窗可保存', async () => {
	const { default: puppeteer } = await import('puppeteer');
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	const createdUsername = `qa_new_${RUN_ID}`.slice(0, 20);
	try {
		await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
		await browser.setCookie({
			name: 'token',
			value: adminToken,
			domain: '127.0.0.1',
			path: '/'
		});
		await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle0' });

		await page.locator(`button[data-user-id="${moderatedUserId}"]`).click();
		await page.waitForSelector('dialog.admin-reason-dialog[open]');
		const reasonDialog = await page.$eval('dialog.admin-reason-dialog', (dialog) => {
			const rect = dialog.getBoundingClientRect();
			return {
				centerX: rect.left + rect.width / 2,
				centerY: rect.top + rect.height / 2,
				viewportX: window.innerWidth / 2,
				viewportY: window.innerHeight / 2
			};
		});
		assert.ok(Math.abs(reasonDialog.centerX - reasonDialog.viewportX) < 2, '理由弹窗应水平居中');
		assert.ok(Math.abs(reasonDialog.centerY - reasonDialog.viewportY) < 2, '理由弹窗应垂直居中');

		await page.locator('#admin-reason-dialog-input').fill('浏览器回归验证后台处置');
		const moderationReload = page.waitForNavigation({ waitUntil: 'networkidle0' });
		await page.locator('.admin-reason-dialog button[type="submit"]').click();
		await moderationReload;
		assert.equal((await prisma.user.findUnique({ where: { id: moderatedUserId } }))?.isDisabled, true);

		await page.locator('#create-user-open').click();
		await page.waitForSelector('#create-user-dialog[open]');
		const createDialog = await page.$eval('#create-user-dialog', (dialog) => {
			const rect = dialog.getBoundingClientRect();
			return {
				centerX: rect.left + rect.width / 2,
				centerY: rect.top + rect.height / 2,
				viewportX: window.innerWidth / 2,
				viewportY: window.innerHeight / 2
			};
		});
		assert.ok(Math.abs(createDialog.centerX - createDialog.viewportX) < 2, '添加用户弹窗应水平居中');
		assert.ok(Math.abs(createDialog.centerY - createDialog.viewportY) < 2, '添加用户弹窗应垂直居中');

		await page.locator('#create-user-username').fill(createdUsername);
		await page.locator('#create-user-email').fill(`${createdUsername}@example.test`);
		await page.locator('#create-user-password').fill('qa-browser-password');
		const createReload = page.waitForNavigation({ waitUntil: 'networkidle0' });
		await page.locator('#create-user-submit').click();
		await createReload;
		assert.ok(await prisma.user.findUnique({ where: { username: createdUsername } }));
	} finally {
		await browser.close();
	}
});
