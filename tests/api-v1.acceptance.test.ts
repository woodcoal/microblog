/**
 * /api/v1 HTTP 验收测试。
 *
 * 使用 Node 内置 node:test 与项目已有的 tsx；测试启动真实 Astro server，
 * 因而覆盖路由、中间件、认证、DTO 和当前数据库 provider 的持久化，而非只 mock service。
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/db';
import { hashEmailVerificationToken } from '../src/lib/email-verification';
import { hashPasswordResetToken } from '../src/lib/password-reset';
import { hashEmailChangeToken } from '../src/lib/email-change';

const PORT = 4329;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const alice = `qa_alice_${RUN_ID}`.slice(0, 20);
const bob = `qa_bob_${RUN_ID}`.slice(0, 20);
const password = 'acceptance-password';

let aliceToken = '';
let bobToken = '';
let postId = '';
let aliceId = '';
let apiToken = '';
const visibilityPostIds: Partial<Record<string, string>> = {};

async function request(path: string, init: RequestInit = {}) {
	return fetch(`${BASE_URL}${path}`, {
		...init,
		headers: { accept: 'application/json', origin: BASE_URL, ...(init.headers ?? {}) }
	});
}

type ErrorResponse = { error: { code: string } };
type OpenApiDocument = {
	openapi: string;
	servers: Array<{ url: string }>;
	paths: Record<
		string,
		Record<string, { responses: Record<number, { content: Record<string, unknown> }> }>
	>;
	components: { schemas: { Post: { properties: { visibility: { enum: string[] } } } } };
};

async function json<T>(response: Response): Promise<T> {
	assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
	return response.json() as Promise<T>;
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

/**
 * Astro 在 AI agent 环境中会把 dev server 转为受锁文件管理的后台进程，
 * spawn 得到的 pnpm 进程退出并不代表监听器退出。必须通过 Astro CLI 停止它。
 */
async function waitForServerToStop() {
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			await request('/api/v1/posts');
		} catch {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw new Error('Astro server did not stop');
}

async function stopBackgroundAstroServer() {
	// Astro 的 agent 模式会使 dev server 脱离 spawn 的子进程树；先只终止本测试专用端口的监听者。
	if (process.platform === 'linux') {
		const result = spawnSync('fuser', ['-k', '-TERM', `${PORT}/tcp`], { stdio: 'ignore' });
		if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT')
			throw result.error;
	}
	await waitForServerToStop();
	const child = spawn('pnpm', ['exec', 'astro', 'dev', 'stop'], { stdio: 'ignore' });
	for (let attempt = 0; attempt < 40; attempt++) {
		if (child.exitCode !== null || child.signalCode !== null) {
			if (child.exitCode !== 0)
				throw new Error(`无法停止 Astro dev server（退出码 ${child.exitCode}）`);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	child.kill('SIGTERM');
	throw new Error('Astro dev stop command did not exit');
}

before(async () => {
	await stopBackgroundAstroServer();
	await waitForServerToStop();
	spawn('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
		env: { ...process.env },
		stdio: 'pipe',
		detached: process.platform !== 'win32'
	});
	await waitForServer();

	for (const username of [alice, bob]) {
		const response = await request('/api/v1/auth/register', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				username,
				displayName: username,
				email: `${username}@example.test`,
				password
			})
		});
		assert.equal(response.status, 202);
		const registration = await json<{ accepted: boolean; nextAction: string; message: string }>(
			response
		);
		assert.equal(registration.accepted, true);
		assert.ok(['verify_email', 'login'].includes(registration.nextAction));
		const user = await prisma.user.findUniqueOrThrow({ where: { username } });
		if (username === alice) aliceId = user.id;
		await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
	}

	apiToken = `mt_${RUN_ID.padEnd(32, '0').slice(0, 32)}`;
	await prisma.apiToken.create({
		data: {
			userId: aliceId,
			name: 'acceptance test token',
			tokenHash: createHash('sha256').update(apiToken).digest('hex')
		}
	});

	for (const [username, target] of [
		[alice, 'alice'],
		[bob, 'bob']
	] as const) {
		const response = await request('/api/v1/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `${username}@example.test`, password })
		});
		assert.equal(response.status, 200);
		const body = await json<{ token: string }>(response);
		assert.equal(typeof body.token, 'string');
		if (target === 'alice') aliceToken = body.token;
		else bobToken = body.token;
	}
});

after(async () => {
	await stopBackgroundAstroServer();
	await prisma.$disconnect();
});

test('公开读返回 JSON 分页结构，非法分页返回统一错误体', async () => {
	const list = await request('/api/v1/posts?page=1&pageSize=20');
	assert.equal(list.status, 200);
	const listBody = await json<{
		items: unknown[];
		page: number;
		pageSize: number;
		total: number;
	}>(list);
	assert.deepEqual(Object.keys(listBody).sort(), ['items', 'page', 'pageSize', 'total']);
	assert.equal(listBody.page, 1);
	assert.equal(listBody.pageSize, 20);

	const invalid = await request('/api/v1/posts?page=0');
	assert.equal(invalid.status, 400);
	assert.equal((await json<ErrorResponse>(invalid)).error.code, 'BAD_REQUEST');
});

test('OpenAPI 覆盖首批端点，并以产品定义的 7 种可见性描述 DTO', async () => {
	const spec = await json<OpenApiDocument>(await request('/api/docs.json'));
	assert.equal(spec.openapi, '3.0.3');
	assert.equal(spec.servers[0].url, '/api/v1');
	for (const [path, method] of [
		['/auth/register', 'post'],
		['/auth/login', 'post'],
		['/auth/verify-email', 'post'],
		['/auth/resend-verification', 'post'],
		['/auth/change-email', 'post'],
		['/auth/confirm-email-change', 'post'],
		['/posts', 'get'],
		['/posts', 'post'],
		['/posts/{id}', 'get'],
		['/posts/{id}', 'put'],
		['/posts/{id}', 'delete'],
		['/posts/{id}/comments', 'get'],
		['/posts/{id}/comments', 'post'],
		['/comments/{id}', 'delete'],
		['/posts/{id}/like', 'put'],
		['/comments/{id}/like', 'put'],
		['/users/{username}', 'get'],
		['/users/{username}/posts', 'get'],
		['/users/{username}/follow', 'put'],
		['/timeline/latest', 'get'],
		['/timeline/following', 'get'],
		['/search/posts', 'get'],
		['/search/users', 'get'],
		['/tags/{name}/posts', 'get']
	]) {
		assert.ok(spec.paths[path]?.[method], `${method.toUpperCase()} ${path}`);
	}
	assert.deepEqual(spec.components.schemas.Post.properties.visibility.enum, [
		'public',
		'logged_in',
		'followers',
		'following',
		'private',
		'password',
		'users'
	]);
});

test('注册对已存在与不存在邮箱返回完全一致的受理语义', async () => {
	const email = `registration-enum-${RUN_ID}@example.test`;
	const payload = { email, password };
	const first = await request('/api/v1/auth/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const second = await request('/api/v1/auth/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	assert.equal(first.status, 202);
	assert.equal(second.status, first.status);
	assert.deepEqual(await json(second), await json(first));
});

test('邮箱验证 API 统一拒绝无效令牌，并在有效令牌被消费后激活账号', async () => {
	const email = `verify_${RUN_ID}@example.test`;
	const registered = await request('/api/v1/auth/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	assert.equal(registered.status, 202);
	assert.deepEqual(await json(registered), {
		accepted: true,
		nextAction: 'verify_email',
		message: '若邮箱可用，验证邮件已发送'
	});
	const pending = await prisma.user.findUniqueOrThrow({ where: { email } });
	const invalid = await request('/api/v1/auth/verify-email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token: 'invalid' })
	});
	assert.equal(invalid.status, 400);
	const rawToken = crypto.randomUUID();
	await prisma.emailVerificationToken.create({
		data: {
			userId: pending.id,
			tokenHash: hashEmailVerificationToken(rawToken),
			expiresAt: new Date(Date.now() + 60_000)
		}
	});
	const verified = await request('/api/v1/auth/verify-email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token: rawToken })
	});
	assert.equal(verified.status, 200);
	assert.equal((await json<{ verified: boolean }>(verified)).verified, true);
});

test(
	'密码重置 API 抗枚举、单次消费并即时撤销旧 JWT 与 API Token',
	{ concurrency: false },
	async () => {
		const email = `reset_${RUN_ID}@example.test`;
		const registered = await request('/api/v1/auth/register', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
		assert.equal(registered.status, 202);
		assert.deepEqual(await json(registered), {
			accepted: true,
			nextAction: 'verify_email',
			message: '若邮箱可用，验证邮件已发送'
		});
		const pending = await prisma.user.findUniqueOrThrow({ where: { email } });
		await prisma.user.update({
			where: { id: pending.id },
			data: { emailVerifiedAt: new Date() }
		});
		const oldJwt = (
			await json<{ token: string }>(
				await request('/api/v1/auth/login', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email, password })
				})
			)
		).token;
		const oldApiToken = `mt_${crypto.randomUUID().replaceAll('-', '').slice(0, 32)}`;
		await prisma.apiToken.create({
			data: {
				userId: pending.id,
				name: 'password reset acceptance',
				tokenHash: createHash('sha256').update(oldApiToken).digest('hex')
			}
		});
		const known = await request('/api/v1/auth/forgot-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email })
		});
		const unknown = await request('/api/v1/auth/forgot-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `missing_${RUN_ID}@example.test` })
		});
		assert.equal(known.status, unknown.status);
		assert.deepEqual(await json(known), await json(unknown));

		const rawToken = crypto.randomUUID();
		await prisma.passwordResetToken.create({
			data: {
				userId: pending.id,
				tokenHash: hashPasswordResetToken(rawToken),
				expiresAt: new Date(Date.now() + 60_000)
			}
		});
		const reset = await request('/api/v1/auth/reset-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: rawToken, password: 'reset-api-new-password' })
		});
		assert.equal(reset.status, 200);
		assert.equal((await json<{ reset: boolean }>(reset)).reset, true);
		const replay = await request('/api/v1/auth/reset-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: rawToken, password: 'reset-api-new-password' })
		});
		assert.equal(replay.status, 400);
		for (const token of [oldJwt, oldApiToken]) {
			assert.equal(
				(
					await request('/api/v1/timeline/following', {
						headers: { authorization: `Bearer ${token}` }
					})
				).status,
				401
			);
		}
		const nextLogin = await request('/api/v1/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'reset-api-new-password' })
		});
		assert.equal(nextLogin.status, 200);
	}
);

test('OpenAPI 可按 api 参数返回 Agent 纯文本接口文档', async () => {
	const spec = await json<OpenApiDocument>(await request('/api/docs.json?api=agent'));
	assert.equal(spec.openapi, '3.0.3');
	assert.equal(spec.servers[0].url, '/api/agent');
	for (const [path, method] of [
		['/register', 'post'],
		['/posts', 'get'],
		['/posts', 'post'],
		['/notifications', 'get'],
		['/profile', 'put'],
		['/upload', 'post']
	]) {
		assert.ok(spec.paths[path]?.[method], `${method.toUpperCase()} ${path}`);
	}
	assert.ok(spec.paths['/posts'].get.responses[200].content['text/plain']);
});

test('所有已实现写端点在缺少 Bearer 凭证时返回 401 JSON', async () => {
	const requests = [
		request('/api/v1/posts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		}),
		request('/api/v1/posts/missing/comments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		}),
		request('/api/v1/posts/missing', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		}),
		request('/api/v1/posts/missing', { method: 'DELETE' }),
		request('/api/v1/posts/missing/like', { method: 'PUT' }),
		request('/api/v1/comments/missing', { method: 'DELETE' }),
		request('/api/v1/comments/missing/like', { method: 'PUT' }),
		request(`/api/v1/users/${bob}/follow`, { method: 'PUT' }),
		request('/api/v1/timeline/following')
	];
	for (const response of await Promise.all(requests)) {
		assert.equal(response.status, 401);
		assert.equal((await json<ErrorResponse>(response)).error.code, 'UNAUTHORIZED');
	}
	const cookieOnly = await request('/api/v1/posts', {
		method: 'POST',
		headers: { cookie: `token=${aliceToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({ content: 'cookie must not authenticate v1 writes' })
	});
	assert.equal(cookieOnly.status, 401);
	assert.equal((await json<ErrorResponse>(cookieOnly)).error.code, 'UNAUTHORIZED');
});

test(
	'v1 换绑确认前保留旧邮箱，确认后原子撤销旧 JWT 与 API Token',
	{ concurrency: false },
	async () => {
		const username = `v1_change_${RUN_ID}`.slice(0, 20);
		const oldEmail = `${username}@example.test`;
		const targetEmail = `v1_changed_${RUN_ID}@example.test`;
		const registered = await request('/api/v1/auth/register', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ username, email: oldEmail, password })
		});
		assert.equal(registered.status, 202);
		const changingUser = await prisma.user.findUniqueOrThrow({ where: { email: oldEmail } });
		await prisma.user.update({
			where: { id: changingUser.id },
			data: { emailVerifiedAt: new Date() }
		});
		const oldJwt = (
			await json<{ token: string }>(
				await request('/api/v1/auth/login', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: oldEmail, password })
				})
			)
		).token;
		const oldApiToken = `mt_${crypto.randomUUID().replaceAll('-', '').slice(0, 32)}`;
		await prisma.apiToken.create({
			data: {
				userId: changingUser.id,
				name: 'email change acceptance',
				tokenHash: createHash('sha256').update(oldApiToken).digest('hex')
			}
		});
		const start = await request('/api/v1/auth/change-email', {
			method: 'POST',
			headers: { authorization: `Bearer ${oldJwt}`, 'content-type': 'application/json' },
			body: JSON.stringify({ currentPassword: password, targetEmail })
		});
		assert.equal(start.status, 202);
		assert.deepEqual(await json(start), {
			accepted: true,
			message: '若新邮箱可用，确认邮件已发送'
		});
		assert.equal(
			(await prisma.user.findUniqueOrThrow({ where: { id: changingUser.id } })).email,
			oldEmail
		);

		const rawToken = crypto.randomUUID();
		await prisma.emailChangeToken.create({
			data: {
				userId: changingUser.id,
				targetEmail,
				tokenHash: hashEmailChangeToken(rawToken),
				expiresAt: new Date(Date.now() + 60_000)
			}
		});
		const confirmed = await request('/api/v1/auth/confirm-email-change', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: rawToken })
		});
		assert.equal(confirmed.status, 200);
		assert.deepEqual(await json(confirmed), { changed: true });
		assert.equal(
			(await prisma.user.findUniqueOrThrow({ where: { id: changingUser.id } })).email,
			targetEmail
		);
		for (const token of [oldJwt, oldApiToken]) {
			assert.equal(
				(
					await request('/api/v1/timeline/following', {
						headers: { authorization: `Bearer ${token}` }
					})
				).status,
				401
			);
		}
		assert.equal(
			(
				await request('/api/v1/auth/login', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: oldEmail, password })
				})
			).status,
			401
		);
		assert.equal(
			(
				await request('/api/v1/auth/login', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: targetEmail, password })
				})
			).status,
			200
		);
	}
);

test('JWT Bearer 覆盖发帖、读取、点赞、评论、删除与重复删除语义', async () => {
	const auth = { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' };
	const create = await request('/api/v1/posts', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ content: 'api-v1 acceptance post #qa' })
	});
	assert.equal(create.status, 201);
	const created = await json<{ id: string; author: { username: string }; visibility: string }>(
		create
	);
	postId = created.id;
	assert.equal(created.author.username, alice);
	assert.equal(created.visibility, 'public');

	const forbiddenUpdate = await request(`/api/v1/posts/${postId}`, {
		method: 'PUT',
		headers: { authorization: `Bearer ${bobToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({ content: 'not the author' })
	});
	assert.equal(forbiddenUpdate.status, 403);
	assert.equal((await json<ErrorResponse>(forbiddenUpdate)).error.code, 'FORBIDDEN');

	const update = await request(`/api/v1/posts/${postId}`, {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({ content: 'api-v1 acceptance post updated #qa' })
	});
	assert.equal(update.status, 200);
	assert.equal((await json<{ isEdited: boolean }>(update)).isEdited, true);

	const detail = await request(`/api/v1/posts/${postId}`);
	assert.equal(detail.status, 200);
	assert.equal((await json<{ id: string }>(detail)).id, postId);

	const likeHeaders = { authorization: `Bearer ${bobToken}` };
	for (const active of [true, false]) {
		const response = await request(`/api/v1/posts/${postId}/like`, {
			method: 'PUT',
			headers: likeHeaders
		});
		assert.equal(response.status, 200);
		assert.equal((await json<{ active: boolean }>(response)).active, active);
	}

	const comment = await request(`/api/v1/posts/${postId}/comments`, {
		method: 'POST',
		headers: { ...likeHeaders, 'content-type': 'application/json' },
		body: JSON.stringify({ content: 'acceptance comment' })
	});
	assert.equal(comment.status, 201);
	const commentId = (await json<{ id: string }>(comment)).id;
	const comments = await request(`/api/v1/posts/${postId}/comments`);
	assert.equal(comments.status, 200);
	assert.equal((await json<{ items: Array<{ id: string }> }>(comments)).items[0].id, commentId);
	for (const active of [true, false]) {
		const response = await request(`/api/v1/comments/${commentId}/like`, {
			method: 'PUT',
			headers: likeHeaders
		});
		assert.equal(response.status, 200);
		assert.equal((await json<{ active: boolean }>(response)).active, active);
	}

	const deleteComment = await request(`/api/v1/comments/${commentId}`, {
		method: 'DELETE',
		headers: likeHeaders
	});
	assert.equal(deleteComment.status, 204);
	const repeatDelete = await request(`/api/v1/comments/${commentId}`, {
		method: 'DELETE',
		headers: likeHeaders
	});
	assert.equal(repeatDelete.status, 404);
	assert.equal((await json<ErrorResponse>(repeatDelete)).error.code, 'NOT_FOUND');

	const deletePost = await request(`/api/v1/posts/${postId}`, {
		method: 'DELETE',
		headers: auth
	});
	assert.equal(deletePost.status, 204);
	const repeatPostDelete = await request(`/api/v1/posts/${postId}`, {
		method: 'DELETE',
		headers: auth
	});
	assert.equal(repeatPostDelete.status, 404);
	assert.equal((await json<ErrorResponse>(repeatPostDelete)).error.code, 'NOT_FOUND');
});

test('博客文章可保存自定义分类，且不能与系统分类同时设置', async () => {
	const auth = { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' };
	const create = await request('/api/v1/posts', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			content: 'custom category acceptance post',
			title: '自定义分类文章',
			mode: 'blog',
			customCategory: '随笔'
		})
	});
	assert.equal(create.status, 201);
	const created = await json<{ id: string; customCategory: string | null }>(create);
	assert.equal(created.customCategory, '随笔');
	const update = await request(`/api/v1/posts/${created.id}`, {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({
			content: 'custom category acceptance post updated',
			customCategory: '开发笔记'
		})
	});
	assert.equal(update.status, 200);
	assert.equal(
		(await json<{ customCategory: string | null }>(update)).customCategory,
		'开发笔记'
	);

	const invalid = await request('/api/v1/posts', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			content: 'invalid custom category post',
			title: '冲突分类文章',
			mode: 'blog',
			categoryId: 'missing-category',
			customCategory: '随笔'
		})
	});
	assert.equal(invalid.status, 400);
	assert.equal((await json<ErrorResponse>(invalid)).error.code, 'BAD_REQUEST');
});

test('mt_ Bearer token 与 JWT token 均可通过 /api/v1 认证', async () => {
	const response = await request('/api/v1/timeline/following', {
		headers: { authorization: `Bearer ${apiToken}` }
	});
	assert.equal(response.status, 200);
	assert.ok(Array.isArray((await json<{ items: unknown[] }>(response)).items));
});

test('JWT Bearer 覆盖关注切换与关注时间线', async () => {
	const headers = { authorization: `Bearer ${bobToken}` };
	for (const active of [true, false]) {
		const response = await request(`/api/v1/users/${alice}/follow`, { method: 'PUT', headers });
		assert.equal(response.status, 200);
		assert.equal((await json<{ active: boolean }>(response)).active, active);
	}
	const timeline = await request('/api/v1/timeline/following', { headers });
	assert.equal(timeline.status, 200);
	assert.ok(Array.isArray((await json<{ items: unknown[] }>(timeline)).items));
});

test('CORS 非白名单来源与超大请求体被中间件拒绝', async () => {
	const cors = await request('/api/v1/posts', {
		headers: { origin: 'https://forbidden.example' }
	});
	assert.equal(cors.status, 403);
	assert.equal((await json<ErrorResponse>(cors)).error.code, 'FORBIDDEN');

	const oversized = await request('/api/v1/posts', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${aliceToken}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ content: 'x'.repeat(1_048_576) })
	});
	assert.equal(oversized.status, 413);
	assert.equal((await json<ErrorResponse>(oversized)).error.code, 'BAD_REQUEST');
});

test('所有 7 种产品可见性均可被创建端点接受，并保留到 DTO', async () => {
	const headers = { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' };
	for (const visibility of [
		'public',
		'logged_in',
		'followers',
		'following',
		'private',
		'password',
		'users'
	]) {
		const payload: Record<string, unknown> = {
			content: `visibility ${visibility}`,
			visibility
		};
		if (visibility === 'password') payload.password = 'visibility-secret';
		if (visibility === 'users') {
			const profile = await request(`/api/v1/users/${bob}`);
			payload.allowedUserIds = [(await json<{ id: string }>(profile)).id];
		}
		const response = await request('/api/v1/posts', {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});
		assert.equal(response.status, 201, visibility);
		const created = await json<{ visibility: string; id: string }>(response);
		assert.equal(created.visibility, visibility);
		visibilityPostIds[visibility] = created.id;
	}
});

test('7 种可见性按 Bearer 身份读取，password 支持详情密码传递', async () => {
	const id = (visibility: string) => {
		const postId = visibilityPostIds[visibility];
		assert.ok(postId, `${visibility} post should have been created`);
		return postId;
	};
	const aliceHeaders = { authorization: `Bearer ${aliceToken}` };
	const bobHeaders = { authorization: `Bearer ${bobToken}` };

	assert.equal((await request(`/api/v1/posts/${id('public')}`)).status, 200);
	assert.equal((await request(`/api/v1/posts/${id('logged_in')}`)).status, 404);
	assert.equal(
		(await request(`/api/v1/posts/${id('logged_in')}`, { headers: bobHeaders })).status,
		200
	);

	assert.equal(
		(await request(`/api/v1/users/${alice}/follow`, { method: 'PUT', headers: bobHeaders }))
			.status,
		200
	);
	assert.equal(
		(await request(`/api/v1/posts/${id('followers')}`, { headers: bobHeaders })).status,
		200
	);

	assert.equal(
		(await request(`/api/v1/users/${bob}/follow`, { method: 'PUT', headers: aliceHeaders }))
			.status,
		200
	);
	assert.equal(
		(await request(`/api/v1/posts/${id('following')}`, { headers: bobHeaders })).status,
		200
	);

	assert.equal(
		(await request(`/api/v1/posts/${id('private')}`, { headers: bobHeaders })).status,
		404
	);
	assert.equal(
		(await request(`/api/v1/posts/${id('private')}`, { headers: aliceHeaders })).status,
		200
	);
	assert.equal(
		(
			await request(`/api/v1/posts/${id('private')}`, {
				headers: { cookie: `token=${aliceToken}` }
			})
		).status,
		404
	);

	const passwordListResponse = await request('/api/v1/posts', {
		headers: { ...bobHeaders, 'x-forwarded-for': '10.10.10.10' }
	});
	assert.equal(passwordListResponse.status, 200);
	const passwordList = await json<{
		items: Array<{ id: string; content: string; isPasswordProtected: boolean }>;
	}>(passwordListResponse);
	const passwordPost = passwordList.items.find(
		(post: { id: string }) => post.id === id('password')
	);
	assert.ok(passwordPost, 'password post should be present in the list');
	assert.equal(passwordPost.content, '[受限内容]');
	assert.equal(passwordPost.isPasswordProtected, true);
	assert.equal(
		(await request(`/api/v1/posts/${id('password')}`, { headers: bobHeaders })).status,
		404
	);
	const passwordDetail = await request(
		`/api/v1/posts/${id('password')}?password=visibility-secret`,
		{
			headers: bobHeaders
		}
	);
	assert.equal(passwordDetail.status, 200);
	assert.equal((await json<{ content: string }>(passwordDetail)).content, 'visibility password');

	assert.equal(
		(await request(`/api/v1/posts/${id('users')}`, { headers: bobHeaders })).status,
		200
	);
});

test('v1 注销端点要求认证和当前密码，并立即拒绝旧 JWT 与 API Token', async () => {
	const unauthenticated = await request('/api/v1/auth/delete-account', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ currentPassword: password })
	});
	assert.equal(unauthenticated.status, 401);
	assert.equal((await json<ErrorResponse>(unauthenticated)).error.code, 'UNAUTHORIZED');

	const wrongPassword = await request('/api/v1/auth/delete-account', {
		method: 'POST',
		headers: { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({ currentPassword: 'incorrect-password' })
	});
	assert.equal(wrongPassword.status, 401);
	assert.equal((await json<ErrorResponse>(wrongPassword)).error.code, 'UNAUTHORIZED');

	const deleted = await request('/api/v1/auth/delete-account', {
		method: 'POST',
		headers: { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({ currentPassword: password })
	});
	assert.equal(deleted.status, 200);
	assert.deepEqual(await json(deleted), { deleted: true });

	for (const token of [aliceToken, apiToken]) {
		const rejected = await request('/api/v1/timeline/following', {
			headers: { authorization: `Bearer ${token}` }
		});
		assert.equal(rejected.status, 401);
	}
});
