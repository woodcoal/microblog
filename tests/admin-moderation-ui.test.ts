import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
	assert.match(dialog, /requestId \?\?= crypto\.randomUUID\(\)/);
	assert.match(dialog, /isSubmitting/);
	assert.match(dialog, /aria-live/);
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
