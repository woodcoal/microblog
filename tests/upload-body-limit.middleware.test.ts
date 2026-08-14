import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkBodyLimit } from '../src/lib/api-security';

const uploadRoutes = [
	'/api/upload',
	'/api/agent/upload',
	'/api/v1/upload',
	'/_actions/uploadMedia',
	'/_actions/uploadAvatar'
];
const overLimitPayload = new Uint8Array(1025);

function chunkedBody(payload: Uint8Array) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(payload.slice(0, 512));
			controller.enqueue(payload.slice(512));
			controller.close();
		}
	});
}

function request(pathname: string, body: BodyInit | null, headers: HeadersInit = {}) {
	return new Request(`http://localhost${pathname}`, {
		method: 'POST',
		headers,
		body,
		duplex: 'half'
	} as RequestInit);
}

test('五个入口中间件共用门禁拒绝伪报 Content-Length 与 chunked 超限请求', async () => {
	for (const pathname of uploadRoutes) {
		assert.deepEqual(
			await checkBodyLimit(
				request(pathname, overLimitPayload, { 'content-length': '1' }),
				1024
			),
			{ allowed: false },
			`${pathname} 伪报 Content-Length`
		);
		assert.deepEqual(
			await checkBodyLimit(request(pathname, chunkedBody(overLimitPayload)), 1024),
			{ allowed: false },
			`${pathname} chunked`
		);
	}
});

test('五个入口中间件共用门禁放行未超限的合法请求', async () => {
	for (const pathname of uploadRoutes) {
		assert.deepEqual(
			await checkBodyLimit(
				request(pathname, new Uint8Array(1024), { 'content-length': '1024' }),
				1024
			),
			{ allowed: true },
			pathname
		);
	}
});

test('Astro 中间件在 API、Action 与 CSRF 解析前执行上传门禁', async () => {
	const source = await readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8');
	const gate = source.indexOf(
		'const bodyResult = await checkBodyLimit(request, getBodyLimit(url.pathname));'
	);
	assert.ok(gate >= 0);
	assert.ok(gate < source.indexOf('if (isApiRoute(url.pathname))'));
	assert.ok(
		gate < source.indexOf('const valid = await validateCsrfToken(request, context.cookies);')
	);
});
