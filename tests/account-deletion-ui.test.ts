import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('设置页要求当前密码和明确确认后才调用永久注销 Action', async () => {
	const source = await read('src/pages/settings/index.astro');
	assert.match(source, /id="account-deletion-form"/);
	assert.match(source, /账号、用户名和登录邮箱将永久不能再用/);
	assert.match(source, /历史评论会显示为“已注销用户”/);
	assert.match(source, /autocomplete="current-password"/);
	assert.match(source, /MutanDialog\.confirm\([\s\S]*确认永久注销？[\s\S]*danger: true/);
	assert.match(source, /actions\.deleteAccountAction\(\{ currentPassword \}\)/);
	assert.match(source, /localStorage\.removeItem\('token'\)/);
	assert.match(source, /window\.location\.assign\('\/\?account-deleted=1'\)/);
	assert.match(source, /aria-live="polite"/);
});

test('安全落地页确认账号已注销', async () => {
	const source = await read('src/pages/index.astro');
	assert.match(source, /account-deleted/);
	assert.match(source, /账号已永久注销，你已安全退出。/);
	assert.match(source, /role="status"/);
});

test('已注销评论作者不再输出个人资料链接、用户名或头像', async () => {
	const detailSource = await read('src/lib/post-detail.ts');
	const componentSource = await read('src/components/CommentItem.astro');
	assert.match(detailSource, /displayName: '已注销用户',[\s\S]*isDeleted: true/);
	assert.match(componentSource, /const isDeletedAccount = Boolean\(comment\.user\.isDeleted\)/);
	assert.match(componentSource, /isDeletedAccount \? \([\s\S]*aria-label="已注销用户"/);
	assert.match(
		componentSource,
		/const replyIsDeletedAccount = Boolean\(reply\.user\.isDeleted\)/
	);
	assert.match(componentSource, /replyIsDeletedAccount \? \([\s\S]*aria-label="已注销用户"/);
});
