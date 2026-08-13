import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/lib/db';
import {
	saveSmtpConfiguration,
	testSmtpConfiguration,
	type SmtpInput
} from '../src/services/mail-delivery.service';
import { ServiceError } from '../src/lib/errors';

const saved: SmtpInput = {
	host: 'mail.example.test',
	port: 465,
	security: 'tls',
	username: 'mailer',
	password: 'saved-smtp-password',
	fromName: '睦谈',
	fromAddress: 'mailer@example.test'
};

after(async () => {
	await prisma.$disconnect();
});

test('测试连接草稿留空密码时复用已保存的加密密码', async () => {
	await saveSmtpConfiguration(saved);
	let tested: { host: string; port: number; password: string } | undefined;
	await testSmtpConfiguration(
		{ ...saved, host: 'preview.example.test', port: 587, password: '' },
		async (config) => {
			tested = { host: config.host, port: config.port, password: config.password };
		}
	);
	assert.deepEqual(tested, {
		host: 'preview.example.test',
		port: 587,
		password: saved.password
	});
});

test('首次未配置或明确提交空密码的测试保持稳定失败且不执行连接', async () => {
	await prisma.smtpConfiguration.deleteMany();
	await assert.rejects(
		() => testSmtpConfiguration(undefined, async () => assert.fail('不应执行连接')),
		(error: unknown) =>
			error instanceof ServiceError && error.code === 'SMTP_CONFIGURATION_INVALID'
	);
	await assert.rejects(
		() => testSmtpConfiguration({ ...saved, password: '', clearPassword: true }),
		(error: unknown) =>
			error instanceof ServiceError && error.code === 'SMTP_CONFIGURATION_INVALID'
	);
});
