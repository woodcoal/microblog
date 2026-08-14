import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getPageSurface } from '../src/lib/page-surface';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('页面展示面严格区分公开、身份和私有页面', () => {
	assert.equal(getPageSurface('/'), 'public');
	assert.equal(getPageSurface('/u/post-id'), 'public');
	assert.equal(getPageSurface('/login'), 'identity');
	assert.equal(getPageSurface('/verify-email'), 'identity');
	assert.equal(getPageSurface('/admin/page-customization'), 'private');
	assert.equal(getPageSurface('/settings'), 'private');
	assert.equal(getPageSurface('/api/v1/posts'), 'private');
	assert.equal(getPageSurface('/alice/post-id/edit'), 'private');
	assert.equal(getPageSurface('/alice/post-id/revisions'), 'private');
});

test('基础布局仅在允许页面渲染页脚和公开统计脚本', async () => {
	const source = await read('src/layouts/Base.astro');
	assert.match(source, /getPageSurface\(currentPath\)/);
	assert.match(source, /pageSurface === 'public' \|\| pageSurface === 'identity'/);
	assert.match(source, /getPublicSiteCopy\('global\.footer'\)/);
	assert.match(source, /pageSurface === 'public' \? await getPublicAnalyticsScript\(\) : ''/);
	assert.match(source, /<Fragment set:html=\{publicAnalyticsScript\} \/>/);
});

test('页面定制页使用受保护 Action，并将错误状态暴露给管理员', async () => {
	const [page, editor, layout] = await Promise.all([
		read('src/pages/admin/page-customization.astro'),
		read('src/components/admin/PageCustomizationEditor.astro'),
		read('src/layouts/Admin.astro')
	]);
	assert.match(page, /<AdminLayout title="页面定制">/);
	assert.match(editor, /actions\.getPageCustomization\(\)/);
	assert.match(editor, /actions\.updatePageCustomizationAction\(input\)/);
	assert.match(editor, /安全提示：脚本会以本站权限/);
	assert.match(editor, /role="status" aria-live="polite"/);
	assert.match(editor, /footerMarkdown: '', publicAnalyticsScript: ''/);
	assert.match(layout, /path: '\/admin\/page-customization'/);
});

test('后台用户表展示服务端活动事实，并给空值和未验证状态明确标签', async () => {
	const [page, list] = await Promise.all([
		read('src/pages/admin/users.astro'),
		read('src/components/admin/AdminUserList.astro')
	]);
	for (const field of ['lastLoginAt', 'lastActiveAt', 'loginCount', 'emailVerifiedAt']) {
		assert.match(page, new RegExp(field));
		assert.match(list, new RegExp(field));
	}
	assert.match(list, /if \(!value\) return '暂无记录'/);
	assert.match(list, /user\.emailVerifiedAt !== null/);
	assert.match(list, /admin-badge-unverified/);
	assert.match(list, /登录次数/);
});
