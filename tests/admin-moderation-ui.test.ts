import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAdminRequestId } from '../src/scripts/admin-reason-dialog';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('后台处置统一经过理由对话框，且不会退回 prompt', async () => {
	const [users, posts, comments, dialog] = await Promise.all([
		read('src/components/admin/AdminUserList.astro'),
		read('src/components/admin/AdminPostList.astro'),
		read('src/components/admin/AdminCommentList.astro'),
		read('src/scripts/admin-reason-dialog.ts')
	]);
	for (const source of [users, posts, comments]) {
		assert.match(source, /runReasonedAdminAction/);
		assert.doesNotMatch(source, /prompt\(/);
	}
	assert.match(dialog, /minLength = 2/);
	assert.match(dialog, /maxLength = 500/);
	assert.match(dialog, /requestId \?\?= createAdminRequestId\(\)/);
	assert.match(dialog, /isSubmitting/);
	assert.match(dialog, /aria-live/);
	assert.match(dialog, /form\.noValidate = true/);
	assert.doesNotMatch(dialog, /form\.method = 'dialog'/);
	const styles = await read('src/styles/admin.css');
	assert.match(styles, /\.admin-reason-dialog\s*\{[\s\S]*position: fixed/);
	assert.match(styles, /\.admin-reason-dialog\s*\{[\s\S]*inset: 0/);
	assert.match(styles, /\.admin-reason-dialog\s*\{[\s\S]*margin: auto/);
});

test('用户管理页提供受理由保护的未验证空账号物理清理入口', async () => {
	const [users, adminActions, adminService, readme] = await Promise.all([
		read('src/components/admin/AdminUserList.astro'),
		read('src/actions/admin.ts'),
		read('src/services/admin.service.ts'),
		read('README.md')
	]);
	assert.match(users, /id="purge-unverified-empty-users"/);
	assert.match(users, /actions\.purgeUnverifiedEmptyUsers/);
	assert.match(users, /allowZeroAffected: true/);
	assert.match(adminActions, /purgeUnverifiedEmptyUsers/);
	assert.match(adminService, /user\.purge_unverified_empty/);
	assert.match(adminService, /emailVerifiedAt: null/);
	assert.match(adminService, /lastLoginAt: null/);
	assert.match(adminService, /posts: \{ none: \{\} \}/);
	assert.match(readme, /未验证空账号清理/);
});

test('后台请求 ID 在缺少 crypto.randomUUID 时仍生成 UUID v4', () => {
	const nativeUuid = 'ce7d58a1-0ac8-4ee7-a3b2-70682592f10d';
	assert.equal(createAdminRequestId({ randomUUID: () => nativeUuid }), nativeUuid);

	const fallbackUuid = createAdminRequestId({
		getRandomValues(values) {
			values.fill(0);
			return values;
		}
	});
	assert.equal(fallbackUuid, '00000000-0000-4000-8000-000000000000');
});

test('审计页面通过受保护后台壳和最小 Action DTO 检索游标分页', async () => {
	const [page, list, layout] = await Promise.all([
		read('src/pages/admin/audit.astro'),
		read('src/components/admin/AdminAuditLogList.astro'),
		read('src/layouts/Admin.astro')
	]);
	assert.match(page, /<AdminLayout title="审计日志">/);
	assert.match(layout, /path: '\/admin\/audit'/);
	assert.match(list, /actions\.queryAdminAuditLogs/);
	assert.match(list, /nextCursor/);
	assert.match(list, /textContent/);
	assert.doesNotMatch(list, /innerHTML/);
});
