import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/** 验证真实水印预览 Action 已公开给 Astro 客户端调用。 */
test('服务端 Action 集合公开真实水印预览 Action', async () => {
	const actions = await readFile(new URL('../src/actions/index.ts', import.meta.url), 'utf8');
	assert.match(actions, /previewWatermark/);
	assert.match(actions, /server = \{[\s\S]*previewWatermark/);
});
