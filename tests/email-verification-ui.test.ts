import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('验证页仅调用服务端 Action 并为各结果提供安全引导', async () => {
	const source = await read('src/pages/verify-email.astro');
	assert.match(source, /actions\.verifyEmail\(\{ token \}\)/);
	assert.match(source, /actions\.resendVerification\(\{ email \}\)/);
	assert.match(source, /验证链接无效或已失效/);
	assert.match(source, /role="alert"/);
	assert.match(source, /aria-live="polite"/);
	assert.doesNotMatch(source, /EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS/);
});

test('注册成功与未验证登录均提供可访问的重发路径', async () => {
	const [register, login] = await Promise.all([
		read('src/pages/register.astro'),
		read('src/pages/login.astro')
	]);
	assert.match(register, /账号在完成邮箱验证前无法登录或使用完整功能/);
	assert.match(register, /actions\.resendVerification\(\{ email \}\)/);
	assert.match(login, /未验证的账号暂不能登录或使用完整功能/);
	assert.match(login, /result\.error\.message === '请先完成邮箱验证'/);
	assert.match(login, /role="status" aria-live="polite"/);
});
