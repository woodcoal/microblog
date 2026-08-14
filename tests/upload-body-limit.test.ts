import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyLimitResponse, checkBodyLimit, isUploadRoute } from '../src/lib/api-security';

const uploadRoutes = [
	'/api/upload',
	'/api/agent/upload',
	'/api/v1/upload',
	'/_actions/uploadMedia',
	'/_actions/uploadAvatar'
];

function chunkedBody(text: string) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text.slice(0, 5)));
			controller.enqueue(new TextEncoder().encode(text.slice(5)));
			controller.close();
		}
	});
}

test('五个上传入口都被上传体积限制识别', () => {
	for (const pathname of uploadRoutes) assert.equal(isUploadRoute(pathname), true, pathname);
	assert.equal(isUploadRoute('/api/v1/uploads'), false);
});

test('Content-Length 和 chunked 请求都会在上传解析前被拒绝', async () => {
	for (const pathname of uploadRoutes) {
		const contentLengthRequest = new Request(`http://localhost${pathname}`, {
			method: 'POST',
			headers: { 'content-length': '10' },
			body: '0123456789'
		});
		assert.deepEqual(
			await checkBodyLimit(contentLengthRequest, 8),
			{ allowed: false },
			`${pathname} Content-Length`
		);

		const chunkedRequest = new Request(`http://localhost${pathname}`, {
			method: 'POST',
			body: chunkedBody('0123456789'),
			duplex: 'half'
		} as RequestInit);
		assert.deepEqual(
			await checkBodyLimit(chunkedRequest, 8),
			{ allowed: false },
			`${pathname} chunked`
		);
	}
});

test('伪报的 Content-Length 不会绕过实际请求体大小检查', async () => {
	const request = new Request('http://localhost/api/upload', {
		method: 'POST',
		headers: { 'content-length': '1' },
		body: '0123456789'
	});
	assert.deepEqual(await checkBodyLimit(request, 8), { allowed: false });
});

test('Agent 上传超限保持纯文本协议', async () => {
	const response = bodyLimitResponse({ allowed: false }, false, true);
	assert.equal(response.status, 413);
	assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
	assert.match(await response.text(), /^error: /);
});
