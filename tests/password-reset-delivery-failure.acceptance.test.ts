/** 邮件网关不可达时，Web Action、v1 与 Agent 的找回请求仍须抗枚举。 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

const PORT = 4331;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const password = 'delivery-failure-password';
const usernames = ['web', 'v1', 'agent'].map((prefix) => `${prefix}_${RUN_ID}`.slice(0, 20));
const emails = Object.fromEntries(
	usernames.map((username) => [username.split('_')[0], `${username}@example.test`])
);

async function request(path: string, init: RequestInit = {}) {
	return fetch(`${BASE_URL}${path}`, {
		...init,
		headers: { origin: BASE_URL, ...(init.headers ?? {}) }
	});
}

async function waitForServer() {
	let lastError: unknown;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await request('/api/v1/posts');
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
		spawnSync('fuser', ['-k', '-TERM', `${PORT}/tcp`], { stdio: 'ignore' });
	}
	await new Promise((resolve) => setTimeout(resolve, 125));
}

before(async () => {
	await stopServer();
	for (const username of usernames) {
		await prisma.user.create({
			data: {
				username,
				displayName: username,
				email: `${username}@example.test`,
				passwordHash: await hashPassword(password),
				emailVerifiedAt: new Date()
			}
		});
	}
	spawn('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
		env: {
			...process.env,
			MAIL_DELIVERY_MODE: 'webhook',
			MAIL_DELIVERY_WEBHOOK_URL: 'http://127.0.0.1:1/unavailable',
			API_RATE_LIMIT_READ: '1000',
			API_RATE_LIMIT_WRITE: '1000'
		},
		stdio: 'ignore',
		detached: process.platform !== 'win32'
	});
	await waitForServer();
});

after(async () => {
	await stopServer();
	await prisma.passwordResetToken.deleteMany({
		where: { user: { username: { in: usernames } } }
	});
	await prisma.user.deleteMany({ where: { username: { in: usernames } } });
	await prisma.$disconnect();
});

test('Web Action 在投递失败时对已存在与不存在邮箱返回同一受理结果', async () => {
	const known = await request('/_actions/forgotPassword', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: emails.web })
	});
	const unknown = await request('/_actions/forgotPassword', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: `missing_web_${RUN_ID}@example.test` })
	});
	assert.equal(known.status, unknown.status);
	assert.deepEqual(await known.json(), await unknown.json());
});

test('v1 在投递失败时对已存在与不存在邮箱返回同一受理结果', async () => {
	const known = await request('/api/v1/auth/forgot-password', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: emails.v1 })
	});
	const unknown = await request('/api/v1/auth/forgot-password', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: `missing_v1_${RUN_ID}@example.test` })
	});
	assert.equal(known.status, unknown.status);
	assert.deepEqual(await known.json(), await unknown.json());
});

test('Agent 在投递失败时对已存在与不存在邮箱返回同一受理结果', async () => {
	const known = await request('/api/agent/forgot-password', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: emails.agent })
	});
	const unknown = await request('/api/agent/forgot-password', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: `missing_agent_${RUN_ID}@example.test` })
	});
	assert.equal(known.status, unknown.status);
	assert.equal(await known.text(), await unknown.text());
});
