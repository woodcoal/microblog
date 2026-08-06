import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSiteCopyMarkdown } from '../src/lib/markdown';

test('站点文案渲染支持标题、段落、强调和安全链接', () => {
	const html = renderSiteCopyMarkdown('# 标题\n\n普通 **强调** 内容，访问 [睦谈](/latest)。');

	assert.match(html, /<h1>标题<\/h1>/);
	assert.match(html, /<p>普通 <strong>强调<\/strong> 内容，访问/);
	assert.match(html, /<a href="\/latest" target="_blank" rel="noopener noreferrer">睦谈<\/a>/);
});

test('站点文案渲染移除原始 HTML、图片和危险链接', () => {
	const html = renderSiteCopyMarkdown(
		'<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[危险](javascript:alert(1)) ![图片](https://example.test/a.png)'
	);

	assert.doesNotMatch(html, /<script|<img|onerror|javascript:/i);
	assert.match(html, /危险/);
	assert.match(html, /图片/);
});
