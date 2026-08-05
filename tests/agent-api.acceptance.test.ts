/** /api/agent 真实 HTTP 验收测试。 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../generated/prisma/client';

const PORT = 4330;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_PATH = 'prisma/agent-api-acceptance.db';
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const alice = `ag_alice_${RUN_ID}`.slice(0, 20);
const bob = `ag_bob_${RUN_ID}`.slice(0, 20);
const password = 'agent-acceptance-password';
const prisma = new PrismaClient({
	adapter: new PrismaLibSql({ url: `file:./${DATABASE_PATH}` })
});

let server: ChildProcess;
let serverOutput = '';
let aliceToken = '';
let bobToken = '';
let aliceId = '';
let bobId = '';
let postId = '';
let uploadedUrl = '';

async function request(path: string, init: RequestInit = {}) {
	return fetch(`${BASE_URL}${path}`, {
		...init,
		headers: { origin: BASE_URL, ...(init.headers ?? {}) }
	});
}

async function plainText(response: Response) {
	assert.match(response.headers.get('content-type') ?? '', /^text\/plain/);
	return response.text();
}

function bearer(token: string, json = false): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		...(json ? { 'content-type': 'application/json' } : {})
	};
}

async function waitForServer() {
	let lastError: unknown;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await request('/api/agent/posts');
			if (response.status < 500) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw lastError ?? new Error(`Astro server did not become ready\n${serverOutput}`);
}

async function register(username: string) {
	const response = await request('/api/agent/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			username,
			displayName: username,
			email: `${username}@example.test`,
			password
		})
	});
	assert.equal(response.status, 201, await response.clone().text());
	const body = await plainText(response);
	assert.match(body, /^ok: mt_[A-Za-z0-9_-]+$/);
	return body.slice(4);
}

before(async () => {
	server = spawn(
		'pnpm',
		['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)],
		{
			env: {
				...process.env,
				DATABASE_URL: `file:./${DATABASE_PATH}`,
				API_RATE_LIMIT_READ: '1000',
				API_RATE_LIMIT_WRITE: '1000',
				API_RATE_LIMIT_UPLOAD: '1000'
			},
			stdio: 'pipe'
		}
	);
	server.stdout?.on('data', (chunk) => (serverOutput += chunk.toString()));
	server.stderr?.on('data', (chunk) => (serverOutput += chunk.toString()));
	await waitForServer();
	aliceToken = await register(alice);
	bobToken = await register(bob);
	const users = await prisma.user.findMany({
		where: { username: { in: [alice, bob] } },
		select: { id: true, username: true }
	});
	aliceId = users.find((user) => user.username === alice)?.id ?? '';
	bobId = users.find((user) => user.username === bob)?.id ?? '';
	assert.ok(aliceId && bobId);
});

after(async () => {
	if (!server?.killed) {
		server.kill('SIGTERM');
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	await prisma.$disconnect();
	if (uploadedUrl.startsWith('/uploads/') && !uploadedUrl.includes('..')) {
		await unlink(resolve('public', uploadedUrl.slice(1))).catch(() => {});
	}
	for (const suffix of ['', '-shm', '-wal']) {
		await unlink(`${DATABASE_PATH}${suffix}`).catch(() => {});
	}
});

test('注册、登录、Bearer-only 认证及 v1 Token 互通', async () => {
	const login = await request('/api/agent/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: `${alice}@example.test`, password })
	});
	assert.equal(login.status, 200);
	assert.match(await plainText(login), /^ok: 该用户已有 1 个 API Token/);

	const v1 = await request('/api/v1/timeline/following', { headers: bearer(aliceToken) });
	assert.equal(v1.status, 200);
	assert.match(v1.headers.get('content-type') ?? '', /^application\/json/);

	const v1Login = await request('/api/v1/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: `${alice}@example.test`, password })
	});
	const jwt = ((await v1Login.json()) as { token: string }).token;
	const cookieOnly = await request('/api/agent/note', {
		headers: { cookie: `token=${jwt}` }
	});
	assert.equal(cookieOnly.status, 401);
	assert.equal(await plainText(cookieOnly), 'error: 请先登录');
});

test('资料与私有 note 可写可读', async () => {
	const profile = await request('/api/agent/profile', {
		method: 'PUT',
		headers: bearer(aliceToken, true),
		body: JSON.stringify({ displayName: 'Agent Alice', bio: 'agent acceptance' })
	});
	assert.equal(profile.status, 200);
	assert.equal(await plainText(profile), 'ok');

	const noteValue = `private-note-${RUN_ID}`;
	const updateNote = await request('/api/agent/note', {
		method: 'PUT',
		headers: bearer(aliceToken, true),
		body: JSON.stringify({ note: noteValue })
	});
	assert.equal(updateNote.status, 200);
	const note = await request('/api/agent/note', { headers: bearer(aliceToken) });
	assert.equal(await plainText(note), noteValue);
});

test('imageUrls 发帖、组合过滤、详情、兼容字段和错误映射', async () => {
	const png = new Uint8Array([
		137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
		0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31,
		0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
	]);
	const form = new FormData();
	form.set('file', new File([png], 'pixel.png', { type: 'image/png' }));
	const upload = await request('/api/agent/upload', {
		method: 'POST',
		headers: bearer(aliceToken),
		body: form
	});
	assert.equal(upload.status, 201, await upload.clone().text());
	uploadedUrl = (await plainText(upload)).slice(4);

	const create = await request('/api/agent/posts', {
		method: 'POST',
		headers: bearer(aliceToken, true),
		body: JSON.stringify({
			content: `agent acceptance ${RUN_ID} #agentqa#`,
			imageUrls: [uploadedUrl],
			visibility: 'public'
		})
	});
	assert.equal(create.status, 201, await create.clone().text());
	postId = (await plainText(create)).slice(4);
	assert.equal(await prisma.media.count({ where: { postId } }), 1);

	const list = await request(
		`/api/agent/posts?keyword=${RUN_ID}&tag=agentqa&user=${alice}&sort=latest&limit=10`,
		{ headers: bearer(aliceToken) }
	);
	assert.match(await plainText(list), new RegExp(postId));
	const detail = await request(`/api/agent/posts/${postId}?comments=-1`, {
		headers: bearer(aliceToken)
	});
	assert.match(await plainText(detail), /#MEDIA/);

	const alias = await request('/api/agent/posts', {
		method: 'POST',
		headers: bearer(aliceToken, true),
		body: JSON.stringify({ content: 'mutual alias', visibility: 'mutual', images: [] })
	});
	assert.equal(alias.status, 201);
	const aliasId = (await plainText(alias)).slice(4);
	assert.equal(
		(await prisma.post.findUniqueOrThrow({ where: { id: aliasId } })).visibility,
		'following'
	);

	const tooLong = await request('/api/agent/posts', {
		method: 'POST',
		headers: bearer(aliceToken, true),
		body: JSON.stringify({ content: 'x'.repeat(1001) })
	});
	assert.equal(tooLong.status, 400);
	assert.match(await plainText(tooLong), /^error: 内容不能超过/);
});

test('评论、点赞和关注的显式 action 保持幂等', async () => {
	const comment = await request('/api/agent/comments', {
		method: 'POST',
		headers: bearer(bobToken, true),
		body: JSON.stringify({ postId, content: `comment-${RUN_ID}` })
	});
	assert.equal(comment.status, 201, await comment.clone().text());

	for (const action of ['like', 'like'] as const) {
		const response = await request('/api/agent/likes', {
			method: 'POST',
			headers: bearer(bobToken, true),
			body: JSON.stringify({ postId, action })
		});
		assert.equal(response.status, 200);
	}
	assert.equal(await prisma.like.count({ where: { userId: bobId, postId } }), 1);

	for (const action of ['follow', 'follow'] as const) {
		const response = await request('/api/agent/follows', {
			method: 'POST',
			headers: bearer(bobToken, true),
			body: JSON.stringify({ username: alice, action })
		});
		assert.equal(response.status, 200);
	}
	assert.equal(
		await prisma.follow.count({ where: { followerId: bobId, followingId: aliceId } }),
		1
	);
});

test('通知文本契约及 page/limit 偏移分页有效', async () => {
	for (let attempt = 0; attempt < 20; attempt++) {
		if ((await prisma.notification.count({ where: { recipientId: aliceId } })) >= 3) break;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	const all = await request('/api/agent/notifications?limit=20', {
		headers: bearer(aliceToken)
	});
	assert.match(await plainText(all), /: (comment|like|follow) @/);

	const page1 = await request('/api/agent/notifications?page=1&limit=1', {
		headers: bearer(aliceToken)
	});
	const page2 = await request('/api/agent/notifications?page=2&limit=1', {
		headers: bearer(aliceToken)
	});
	assert.notEqual(await plainText(page1), await plainText(page2));
});
