import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('设置页通过受保护的服务端 Action 发起邮箱换绑且不泄露占用状态', async () => {
	const source = await read('src/pages/settings/index.astro');
	assert.match(source, /actions\.requestEmailChangeAction\(\{ currentPassword, targetEmail \}\)/);
	assert.match(source, /若新邮箱可用，确认邮件已发送/);
	assert.match(source, /旧邮箱在确认前保持有效/);
	assert.match(source, /autocomplete="current-password"/);
	assert.match(source, /aria-live="polite"/);
});

test('确认页只消费服务端令牌并为缺失、失效与成功状态提供可访问引导', async () => {
	const source = await read('src/pages/change-email.astro');
	assert.match(source, /actions\.confirmEmailChangeAction\(\{ token \}\)/);
	assert.match(source, /确认链接无效或已失效/);
	assert.match(source, /旧的 API Token、Webhook\s+凭据已失效/);
	assert.match(source, /role="alert"/);
	assert.match(source, /tabindex="-1"/);
});
