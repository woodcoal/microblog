import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WEIBO_MEDIA_MAX_WIDTH_PX, parseWeiboMediaMaxWidth } from '../src/lib/config';

async function uploadBodyLimitFor(value: string | undefined): Promise<number> {
	const previous = process.env.API_UPLOAD_BODY_LIMIT_BYTES;
	if (value === undefined) delete process.env.API_UPLOAD_BODY_LIMIT_BYTES;
	else process.env.API_UPLOAD_BODY_LIMIT_BYTES = value;
	try {
		const config = await import(
			new URL(`../src/lib/config.ts?upload-limit=${crypto.randomUUID()}`, import.meta.url)
				.href
		);
		return config.API_UPLOAD_BODY_LIMIT_BYTES;
	} finally {
		if (previous === undefined) delete process.env.API_UPLOAD_BODY_LIMIT_BYTES;
		else process.env.API_UPLOAD_BODY_LIMIT_BYTES = previous;
	}
}

test('微博媒体宽度默认使用 640px', () => {
	assert.equal(DEFAULT_WEIBO_MEDIA_MAX_WIDTH_PX, 640);
	assert.equal(parseWeiboMediaMaxWidth(undefined), 640);
	assert.equal(parseWeiboMediaMaxWidth(''), 640);
});

test('微博媒体宽度接受范围内整数', () => {
	assert.equal(parseWeiboMediaMaxWidth('480'), 480);
	assert.equal(parseWeiboMediaMaxWidth('640'), 640);
	assert.equal(parseWeiboMediaMaxWidth('1920'), 1920);
});

test('微博媒体宽度拒绝非整数和越界值', () => {
	for (const value of ['479', '1921', '640.5', 'invalid']) {
		assert.equal(parseWeiboMediaMaxWidth(value), 640);
	}
});

test('上传请求体唯一上限绑定 API_UPLOAD_BODY_LIMIT_BYTES', async () => {
	assert.equal(await uploadBodyLimitFor('12345'), 12345);
	assert.equal(await uploadBodyLimitFor('12345.9'), 12345);
	assert.equal(await uploadBodyLimitFor(undefined), 10 * 1024 * 1024);
});
