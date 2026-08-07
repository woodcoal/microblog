import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pageStyles = await readFile(new URL('../src/styles/ux-pages.css', import.meta.url), 'utf8');

test('1024 至 1199px 的频道列表与论坛详情保持受控阅读宽度', () => {
	assert.match(
		pageStyles,
		/@media \(min-width: 1024px\) and \(max-width: 1199px\)[\s\S]*\[data-ux-shell='weibo'\] \.layout-wide/
	);
	assert.match(pageStyles, /\.layout-wide \.layout-discovery-sidebar \{\s*display: none/);
	assert.match(
		pageStyles,
		/\.post-detail-layout-forum > \.post-detail-primary \{\s*max-width: var\(--layout-content\);\s*margin-inline: auto/
	);
});
