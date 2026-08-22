import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

/** 验证后台水印入口、服务端 Action 和完整配置表单保持同一接口契约。 */
test('管理员水印页面通过真实系统配置与服务端预览 Action 管理完整配置', async () => {
	const [page, editor, layout, actions, service] = await Promise.all([
		read('src/pages/admin/watermark.astro'),
		read('src/components/admin/WatermarkSettingsEditor.astro'),
		read('src/layouts/Admin.astro'),
		read('src/actions/index.ts'),
		read('src/services/watermark.service.ts')
	]);

	assert.match(page, /<AdminLayout title="图片水印">/);
	assert.match(page, /<WatermarkSettingsEditor \/>/);
	assert.match(layout, /path: '\/admin\/watermark'/);
	assert.match(editor, /actions\.getSystemConfiguration\(\)/);
	assert.match(editor, /actions\.updateSystemConfigurationAction\(\{ watermark \}\)/);
	assert.match(editor, /actions\.previewWatermark\(input\)/);
	assert.match(editor, /renderedText/);
	assert.match(actions, /server = \{[\s\S]*previewWatermark/);

	for (const field of [
		'enabled',
		'template',
		'position',
		'offsetX',
		'offsetY',
		'fontSize',
		'color',
		'opacity',
		'rotation',
		'tiled'
	]) {
		assert.match(editor, new RegExp(`name="${field}"`));
	}
	for (const position of [
		'top-left',
		'top-center',
		'top-right',
		'center-left',
		'center',
		'center-right',
		'bottom-left',
		'bottom-center',
		'bottom-right'
	]) {
		assert.match(editor, new RegExp(`value="${position}"`));
		assert.match(service, new RegExp(`'${position}'|${position}:`));
	}
	assert.doesNotMatch(editor, /middle-(left|center|right)/);
	assert.doesNotMatch(service, /middle-(left|center|right)/);
	assert.match(editor, /\{\{username\}\}/);
	assert.match(editor, /\{\{nickname\}\}/);
	assert.match(editor, /\{\{publishedAt\}\}/);
	assert.match(editor, /role="status" aria-live="polite"/);
	assert.match(editor, /关闭时，新发帖图片不加水印/);
});
