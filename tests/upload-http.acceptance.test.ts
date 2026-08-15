/** /api/upload 真实 HTTP 验收：Cookie、CSRF、限流和运行期体积门禁须在同一边界生效。 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { prisma } from '../src/lib/db';
import { generateToken } from '../src/lib/auth';
import { deleteFileRef } from '../src/lib/upload';

const PORT = 4332;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const UPLOAD_LIMIT = 4096;
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const username = `upload_${RUN_ID}`.slice(0, 20);
const csrfToken = 'a'.repeat(43);
const png = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
	0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5,
	0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

let sessionToken = '';
let userId = '';
let uploadedFileStorageId = '';

function cookie(withSession = true, token = csrfToken): string {
	return `${withSession ? `token=${sessionToken}; ` : ''}mutan_csrf=${token}`;
}

function uploadHeaders(withSession = true, token = csrfToken): HeadersInit {
	return { cookie: cookie(withSession, token), 'x-csrf-token': token, origin: BASE_URL };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers ?? {}) } });
}

async function waitForServer(): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await request('/api/upload', { method: 'OPTIONS' });
			if (response.status < 500) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw lastError ?? new Error('Astro server did not become ready');
}

async function stopServer(): Promise<void> {
	if (process.platform === 'linux') {
		const result = spawnSync('fuser', ['-k', '-TERM', `${PORT}/tcp`], { stdio: 'ignore' });
		if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw result.error;
		}
	}
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			await request('/api/upload', { method: 'OPTIONS' });
		} catch {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 125));
	}
	throw new Error('Astro server did not stop');
}

function multipartBody(size: number): Uint8Array {
	const boundary = '----mutan-upload-boundary';
	const head = new TextEncoder().encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversized.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`
	);
	const tail = new TextEncoder().encode(
		`\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileType"\r\n\r\nattachment\r\n--${boundary}--\r\n`
	);
	const payload = new Uint8Array(Math.max(0, size - head.length - tail.length));
	return new Uint8Array([...head, ...payload, ...tail]);
}

before(async () => {
	await stopServer();
	const user = await prisma.user.create({
		data: {
			username,
			displayName: '上传验收用户',
			email: `${username}@example.test`,
			passwordHash: 'not-used-by-this-test',
			emailVerifiedAt: new Date()
		}
	});
	userId = user.id;
	sessionToken = await generateToken({
		userId: user.id,
		username: user.username,
		role: user.role
	});
	spawn('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
		env: {
			...process.env,
			API_UPLOAD_BODY_LIMIT_BYTES: String(UPLOAD_LIMIT),
			API_RATE_LIMIT_READ: '1000',
			API_RATE_LIMIT_WRITE: '1000',
			API_RATE_LIMIT_UPLOAD: '100'
		},
		stdio: 'pipe',
		detached: process.platform !== 'win32'
	});
	await waitForServer();
});

after(async () => {
	await stopServer();
	if (userId) await prisma.uploadReservation.deleteMany({ where: { userId } });
	if (uploadedFileStorageId) await deleteFileRef(uploadedFileStorageId);
	await prisma.user.deleteMany({ where: { username } });
	await prisma.$disconnect();
});

test('同源 Cookie 与有效 CSRF 可经真实 multipart 请求上传，且纳入上传限流桶', async () => {
	const form = new FormData();
	form.set('file', new File([png], 'pixel.png', { type: 'image/png' }));
	form.set('fileType', 'image');
	const response = await request('/api/upload', {
		method: 'POST',
		headers: uploadHeaders(),
		body: form
	});
	assert.equal(response.status, 201, await response.clone().text());
	assert.equal(response.headers.get('x-ratelimit-limit'), '100');
	const body = (await response.json()) as { success: boolean; data: { fileStorageId: string } };
	assert.equal(body.success, true);
	uploadedFileStorageId = body.data.fileStorageId;
});

test('未登录和无效 CSRF 的真实上传请求均被拒绝', async () => {
	const unauthenticated = await request('/api/upload', {
		method: 'POST',
		headers: uploadHeaders(false),
		body: new FormData()
	});
	assert.equal(unauthenticated.status, 401);

	const csrfInvalid = await request('/api/upload', {
		method: 'POST',
		headers: { ...uploadHeaders(), 'x-csrf-token': 'b'.repeat(43) },
		body: new FormData()
	});
	assert.equal(csrfInvalid.status, 403);
});

test('超限 Content-Length 与 chunked multipart 均在真实 HTTP 边界返回 413', async () => {
	const oversized = multipartBody(UPLOAD_LIMIT + 1);
	const declaredOversized = await request('/api/upload', {
		method: 'POST',
		headers: {
			...uploadHeaders(),
			'content-type': 'multipart/form-data; boundary=----mutan-upload-boundary',
			'content-length': String(oversized.byteLength)
		},
		body: oversized.buffer as ArrayBuffer
	});
	assert.equal(declaredOversized.status, 413);

	const chunked = await request('/api/upload', {
		method: 'POST',
		headers: {
			...uploadHeaders(),
			'content-type': 'multipart/form-data; boundary=----mutan-upload-boundary'
		},
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(oversized.slice(0, 1024));
				controller.enqueue(oversized.slice(1024));
				controller.close();
			}
		}),
		duplex: 'half'
	} as RequestInit);
	assert.equal(chunked.status, 413);
});
