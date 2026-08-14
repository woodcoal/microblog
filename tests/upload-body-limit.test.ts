import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBodyLimit, isUploadRoute } from '../src/lib/api-security';

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
		assert.deepEqual(await checkBodyLimit(contentLengthRequest, 8), { allowed: false }, `${pathname} Content-Length`);

		const chunkedRequest = new Request(`http://localhost${pathname}`, {
			method: 'POST',
			body: chunkedBody('0123456789'),
			duplex: 'half'
		} as RequestInit);
		assert.deepEqual(await checkBodyLimit(chunkedRequest, 8), { allowed: false }, `${pathname} chunked`);
	}
});
