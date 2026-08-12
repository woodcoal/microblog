import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('设置页要求当前密码和明确确认后才调用永久注销 Action', async () => {
	const source = await read('src/pages/settings/index.astro');
	assert.match(source, /id="account-deletion-form"/);
	assert.match(source, /账号、用户名和登录邮箱将永久不能再次使用/);
	assert.match(source, /历史评论会保留楼层与内容并显示为“已注销用户”/);
	assert.match(source, /autocomplete="current-password"/);
	assert.match(source, /id="account-deletion-confirmation"/);
	assert.match(source, /MutanDialog\.confirm\(/);
	assert.match(source, /actions\.deleteAccountAction\(\{ currentPassword \}\)/);
	assert.match(source, /window\.location\.assign\('\/\?account-deleted=1'\)/);
	assert.match(source, /aria-live="polite"/);
});

test('注销成功和无效会话都经由统一例程清理本地身份', async () => {
	const source = await read('src/pages/settings/index.astro');
	assert.match(source, /function clearLocalIdentity\(\)/);
	assert.match(source, /localStorage\.removeItem\('token'\)/);
	assert.match(source, /sessionStorage\.clear\(\)/);
	assert.match(source, /document\.cookie = 'token=; path=\/; max-age=0; SameSite=Lax'/);
	assert.match(
		source,
		/result\.error\.code === 'UNAUTHORIZED'[\s\S]*clearLocalIdentity\(\)[\s\S]*\/login\?reason=session-expired/
	);
	assert.match(
		source,
		/clearLocalIdentity\(\)[\s\S]*window\.location\.assign\('\/\?account-deleted=1'\)/
	);
});

test('安全落地页确认账号已注销', async () => {
	const source = await read('src/pages/index.astro');
	assert.match(source, /account-deleted/);
	assert.match(source, /账号已永久注销，你已安全退出。/);
	assert.match(source, /role="status"/);
});

test('已注销评论与点赞者只显示匿名标签，不输出原身份链接或头像', async () => {
	const [detail, commentItem, body] = await Promise.all([
		read('src/lib/post-detail.ts'),
		read('src/components/CommentItem.astro'),
		read('src/components/post-detail/PostDetailBody.astro')
	]);
	assert.match(detail, /displayName: '已注销用户',[\s\S]*isDeleted: true/);
	assert.match(commentItem, /const isDeletedAccount = Boolean\(comment\.user\.isDeleted\)/);
	assert.match(commentItem, /isDeletedAccount \? \([\s\S]*aria-label="已注销用户"/);
	assert.match(commentItem, /const replyIsDeletedAccount = Boolean\(reply\.user\.isDeleted\)/);
	assert.match(commentItem, /replyIsDeletedAccount \? \([\s\S]*aria-label="已注销用户"/);
	assert.match(body, /u\.deletedAt \? \([\s\S]*aria-label="已注销用户"/);
	assert.match(
		body,
		/u\.deletedAt \?[\s\S]*?<span[\s\S]*?\)[\s\S]*?: \([\s\S]*?<a[\s\S]*?href=\{`\/\$\{u\.username\}`\}/
	);
});
