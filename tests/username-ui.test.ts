import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('注册页允许省略用户名，并把占用和保留词裁决交给服务端', async () => {
	const source = await read('src/pages/register.astro');
	assert.match(source, /留空将由系统自动生成唯一用户名（如\s*u_xxxx）/);
	const usernameIndex = source.indexOf('id="username"');
	const usernameInputEnd = source.indexOf('/>', usernameIndex);
	const usernameInput = source.slice(usernameIndex, usernameInputEnd);
	assert.doesNotMatch(usernameInput, /\brequired/);
	assert.match(source, /username: username \|\| undefined/);
	assert.match(source, /保留词、占用和最终可用性均由服务端裁决/);
	assert.doesNotMatch(source, /RESERVED_USERNAMES/);
});

test('自助改名换发包含新用户名的登录 cookie，并呈现服务端剩余额度', async () => {
	const [action, page] = await Promise.all([
		read('src/actions/settings.ts'),
		read('src/pages/settings/index.astro')
	]);
	assert.match(action, /generateToken/);
	assert.match(action, /setTokenCookie/);
	assert.match(action, /username: result\.username/);
	assert.match(page, /自助改名剩余：1 次/);
	assert.match(page, /自助改名剩余：0 次/);
	assert.match(page, /旧用户名会继续跳转至当前主页/);
});

test('管理员用户名编辑明确不消耗自助额度，并调用受保护 Action', async () => {
	const source = await read('src/components/admin/AdminUserList.astro');
	assert.match(source, /管理员修改不消耗该用户的一次自助改名机会/);
	assert.match(source, /data-rename-user-id/);
	assert.match(source, /actions\.renameUser/);
	assert.match(source, /aria-live="assertive"/);
});
