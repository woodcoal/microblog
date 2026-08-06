import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WEIBO_MEDIA_MAX_WIDTH_PX, parseWeiboMediaMaxWidth } from '../src/lib/config';

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
