import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('登录页提供忘记密码入口，受理页只呈现统一结果', async () => {
	const [login, forgot] = await Promise.all([
		read('src/pages/login.astro'),
		read('src/pages/forgot-password.astro')
	]);
	assert.match(login, /href="\/forgot-password"/);
	assert.match(forgot, /actions\.forgotPassword\(\{ email \}\)/);
	assert.match(forgot, /若该邮箱可用，重置邮件已发送/);
	assert.match(forgot, /网络连接异常，请检查后重试/);
	assert.doesNotMatch(forgot, /PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS/);
});

test('重置页将令牌判定交给服务端，并提供安全失败和重新登录引导', async () => {
	const reset = await read('src/pages/reset-password.astro');
	assert.match(
		reset,
		/actions\.confirmPasswordReset\(\{\s*token,\s*password: passwordInput\.value\s*\}\)/
	);
	assert.match(reset, /重置链接无效或已失效/);
	assert.match(reset, /其他设备上的登录状态和旧的 API Token、Webhook\s*凭据已失效/);
	assert.match(reset, /autocomplete="new-password"/);
	assert.match(reset, /role="alert"/);
	assert.doesNotMatch(reset, /PASSWORD_RESET_TOKEN_TTL_MINUTES/);
});
