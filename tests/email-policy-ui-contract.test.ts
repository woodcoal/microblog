import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('注册页使用固定字段顺序，并把用户名放在默认折叠的可选区域', async () => {
	const source = await read('src/pages/register.astro');
	const email = source.indexOf('for="email"');
	const password = source.indexOf('for="password"');
	const confirmation = source.indexOf('for="confirmPassword"');
	const optionalUsername = source.indexOf('设置用户名（可选）');
	assert.ok(email < password && password < confirmation && confirmation < optionalUsername);
	assert.match(source, /<details class="form-group username-optional">/);
	assert.match(
		source,
		/留空将由系统自动生成唯一用户名（如\s*u_xxxx），不消耗后续一次自助改名机会/
	);
	assert.doesNotMatch(source, /id="displayName"/);
});

test('管理邮件页只使用脱敏状态，并经受保护的 Action 保存和测试', async () => {
	const [page, actions, layout] = await Promise.all([
		read('src/pages/admin/email.astro'),
		read('src/actions/config.ts'),
		read('src/layouts/Admin.astro')
	]);
	assert.match(page, /passwordConfigured/);
	assert.match(page, /已配置（\*\*\*\*\*\*\*\*）/);
	assert.doesNotMatch(page, /passwordEncrypted/);
	assert.match(page, /actions\.updateSystemConfigurationAction/);
	assert.match(page, /actions\.testSystemSmtpAction/);
	assert.match(page, /actions\.testSystemSmtpAction\(\{ smtp: input\.smtp \}\)/);
	assert.match(actions, /readSystemConfiguration/);
	assert.match(actions, /updateSystemConfiguration/);
	assert.match(actions, /testSystemSmtp/);
	assert.match(layout, /邮件设置/);
});

test('注册响应公开 nextAction 但不公开角色或首位管理员身份', async () => {
	const [service, v1, agent, docs] = await Promise.all([
		read('src/services/auth.service.ts'),
		read('src/pages/api/v1/auth/register.ts'),
		read('src/pages/api/agent/register.ts'),
		read('src/pages/api/docs.json.ts')
	]);
	assert.match(service, /nextAction: 'verify_email' \| 'login'/);
	assert.match(v1, /nextAction: result\.nextAction/);
	assert.match(agent, /nextAction: \$\{result\.nextAction\}/);
	assert.match(docs, /enum: \['verify_email', 'login'\]/);
	assert.doesNotMatch(v1, /role: result/);
});

test('浏览器入口保留服务端返回的两条邮箱策略文案', async () => {
	const [forgot, change, verify] = await Promise.all([
		read('src/pages/forgot-password.astro'),
		read('src/pages/change-email.astro'),
		read('src/pages/verify-email.astro')
	]);
	assert.match(forgot, /result\.error\.message/);
	assert.match(change, /与管理员联系处理/);
	assert.match(verify, /与管理员联系处理/);
});
