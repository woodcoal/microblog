/** SMTP 配置、加密与投递。所有令牌邮件只能经过此模块。 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { prisma } from '@/lib/db';
import {
	MAIL_DELIVERY_MODE,
	MAIL_DELIVERY_WEBHOOK_AUTHORIZATION,
	MAIL_DELIVERY_WEBHOOK_URL,
	getEnv
} from '@/lib/config';
import { ServiceError } from '@/lib/errors';

const GLOBAL_ID = 'global';
const SMTP_TIMEOUT = 10_000;
type SmtpConfigurationClient = Pick<typeof prisma, 'smtpConfiguration'>;
export type SmtpSecurity = 'tls' | 'starttls';
export type SmtpInput = {
	host: string;
	port: number;
	security: SmtpSecurity;
	username: string;
	password?: string;
	clearPassword?: boolean;
	fromName: string;
	fromAddress: string;
};

function configKey(): Buffer {
	const key = getEnv('CONFIG_ENCRYPTION_KEY');
	if (!key)
		throw new ServiceError(
			'SMTP_CONFIGURATION_INVALID',
			'SMTP 加密密钥未配置，请在环境变量 CONFIG_ENCRYPTION_KEY 中设置 32 字节的 base64 或 64 位 hex 密钥'
		);
	const bytes = /^[0-9a-f]{64}$/i.test(key)
		? Buffer.from(key, 'hex')
		: Buffer.from(key, 'base64');
	if (bytes.length !== 32)
		throw new ServiceError(
			'SMTP_CONFIGURATION_INVALID',
			'SMTP 加密密钥格式无效：必须是 32 字节的 base64 或 64 位 hex'
		);
	return bytes;
}

function encrypt(value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', configKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return [
		iv.toString('base64url'),
		cipher.getAuthTag().toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

function decrypt(value: string): string {
	try {
		const [ivText, tagText, ciphertextText] = value.split('.');
		if (!ivText || !tagText || !ciphertextText) throw new Error();
		const decipher = createDecipheriv(
			'aes-256-gcm',
			configKey(),
			Buffer.from(ivText, 'base64url')
		);
		decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertextText, 'base64url')),
			decipher.final()
		]).toString('utf8');
	} catch {
		throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
	}
}

export function isSmtpAddressBlocked(address: string): boolean {
	if (isIP(address) === 4) {
		const [a, b] = address.split('.').map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127)
		);
	}
	const normalized = address.toLowerCase();
	const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mappedIpv4) return isSmtpAddressBlocked(mappedIpv4[1]);
	return (
		normalized === '::1' ||
		normalized.startsWith('::') ||
		/^fe[89ab][0-9a-f]:/.test(normalized) ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd') ||
		normalized.startsWith('ff') ||
		normalized.startsWith('2001:db8:') ||
		normalized.startsWith('2001:10:') ||
		normalized.startsWith('2001:2:')
	);
}

async function safeAddress(host: string): Promise<string> {
	if (!host || host.length > 253 || /[\s/@]/.test(host))
		throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
	const answers = isIP(host)
		? [{ address: host }]
		: await lookup(host, { all: true, verbatim: true }).catch(() => []);
	if (answers.length === 0 || answers.some((entry) => isSmtpAddressBlocked(entry.address)))
		throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
	return answers[0].address;
}

function validInput(input: SmtpInput): void {
	if (
		!input.host ||
		!Number.isInteger(input.port) ||
		input.port < 1 ||
		input.port > 65535 ||
		!['tls', 'starttls'].includes(input.security) ||
		!input.username ||
		!input.fromName ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.fromAddress)
	) {
		throw new ServiceError('BAD_REQUEST', 'SMTP 参数无效');
	}
}

type StoredSmtp = {
	host: string;
	port: number;
	security: SmtpSecurity;
	username: string;
	password: string;
	fromName: string;
	fromAddress: string;
};
async function storedConfig(): Promise<StoredSmtp> {
	const row = await prisma.smtpConfiguration.findUnique({ where: { id: GLOBAL_ID } });
	if (
		!row ||
		!row.host ||
		!row.port ||
		(row.security !== 'tls' && row.security !== 'starttls') ||
		!row.username ||
		!row.passwordEncrypted ||
		!row.fromName ||
		!row.fromAddress
	)
		throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
	return {
		host: row.host,
		port: row.port,
		security: row.security,
		username: row.username,
		password: decrypt(row.passwordEncrypted),
		fromName: row.fromName,
		fromAddress: row.fromAddress
	};
}

export async function getSmtpConfiguration(client: SmtpConfigurationClient = prisma) {
	const row = await client.smtpConfiguration.findUnique({ where: { id: GLOBAL_ID } });
	return {
		host: row?.host ?? '',
		port: row?.port ?? null,
		security: row?.security ?? null,
		username: row?.username ?? '',
		fromName: row?.fromName ?? '',
		fromAddress: row?.fromAddress ?? '',
		passwordConfigured: Boolean(row?.passwordEncrypted),
		smtpEverConfigured: Boolean(row?.smtpEverConfigured)
	};
}

export async function saveSmtpConfiguration(
	input: SmtpInput,
	client: SmtpConfigurationClient = prisma
): Promise<ReturnType<typeof getSmtpConfiguration>> {
	validInput(input);
	const prior = await client.smtpConfiguration.findUnique({
		where: { id: GLOBAL_ID },
		select: { passwordEncrypted: true }
	});
	const passwordEncrypted = input.clearPassword
		? null
		: input.password
			? encrypt(input.password)
			: (prior?.passwordEncrypted ?? null);
	await client.smtpConfiguration.upsert({
		where: { id: GLOBAL_ID },
		create: {
			id: GLOBAL_ID,
			host: input.host.trim(),
			port: input.port,
			security: input.security,
			username: input.username.trim(),
			passwordEncrypted,
			fromName: input.fromName.trim(),
			fromAddress: input.fromAddress.trim(),
			smtpEverConfigured: true
		},
		update: {
			host: input.host.trim(),
			port: input.port,
			security: input.security,
			username: input.username.trim(),
			passwordEncrypted,
			fromName: input.fromName.trim(),
			fromAddress: input.fromAddress.trim(),
			smtpEverConfigured: true
		}
	});
	return getSmtpConfiguration(client);
}

function readResponse(socket: net.Socket): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = '';
		const timer = setTimeout(() => reject(new Error('timeout')), SMTP_TIMEOUT);
		const onData = (data: Buffer) => {
			text += data.toString('utf8');
			if (/^\d{3} /m.test(text)) done();
		};
		const done = () => {
			clearTimeout(timer);
			socket.off('data', onData);
			resolve(text);
		};
		socket.on('data', onData).once('error', reject);
	});
}
async function command(socket: net.Socket, value: string, expected: number[]): Promise<void> {
	socket.write(`${value}\r\n`);
	const response = await readResponse(socket);
	if (!expected.some((code) => response.startsWith(String(code))))
		throw new Error('smtp response');
}
async function smtpNoop(config: StoredSmtp): Promise<void> {
	const address = await safeAddress(config.host);
	const open =
		config.security === 'tls'
			? tls.connect({
					host: address,
					port: config.port,
					servername: config.host,
					rejectUnauthorized: true
				})
			: net.connect({ host: address, port: config.port });
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), SMTP_TIMEOUT);
		open.once('connect', () => {
			clearTimeout(timer);
			resolve();
		}).once('error', reject);
	});
	let socket: net.Socket = open;
	try {
		await readResponse(socket);
		await command(socket, `EHLO localhost`, [250]);
		if (config.security === 'starttls') {
			await command(socket, 'STARTTLS', [220]);
			socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
				const upgraded = tls.connect(
					{ socket, servername: config.host, rejectUnauthorized: true },
					() => resolve(upgraded)
				);
				upgraded.once('error', reject);
			});
			await command(socket, 'EHLO localhost', [250]);
		}
		await command(socket, 'AUTH LOGIN', [334]);
		await command(socket, Buffer.from(config.username).toString('base64'), [334]);
		await command(socket, Buffer.from(config.password).toString('base64'), [235]);
		await command(socket, 'NOOP', [250]);
		await command(socket, 'QUIT', [221]);
	} finally {
		socket.destroy();
	}
}

async function smtpSend(
	config: StoredSmtp,
	to: string,
	subject: string,
	body: string
): Promise<void> {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('invalid recipient');
	const address = await safeAddress(config.host);
	const open =
		config.security === 'tls'
			? tls.connect({
					host: address,
					port: config.port,
					servername: config.host,
					rejectUnauthorized: true
				})
			: net.connect({ host: address, port: config.port });
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), SMTP_TIMEOUT);
		open.once('connect', () => {
			clearTimeout(timer);
			resolve();
		}).once('error', reject);
	});
	let socket: net.Socket = open;
	try {
		await readResponse(socket);
		await command(socket, 'EHLO localhost', [250]);
		if (config.security === 'starttls') {
			await command(socket, 'STARTTLS', [220]);
			socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
				const upgraded = tls.connect(
					{ socket, servername: config.host, rejectUnauthorized: true },
					() => resolve(upgraded)
				);
				upgraded.once('error', reject);
			});
			await command(socket, 'EHLO localhost', [250]);
		}
		await command(socket, 'AUTH LOGIN', [334]);
		await command(socket, Buffer.from(config.username).toString('base64'), [334]);
		await command(socket, Buffer.from(config.password).toString('base64'), [235]);
		await command(socket, `MAIL FROM:<${config.fromAddress}>`, [250]);
		await command(socket, `RCPT TO:<${to}>`, [250, 251]);
		await command(socket, 'DATA', [354]);
		await command(
			socket,
			`From: ${config.fromName} <${config.fromAddress}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.replace(/^\./gm, '..')}\r\n.`,
			[250]
		);
		await command(socket, 'QUIT', [221]);
	} finally {
		socket.destroy();
	}
}

/**
 * 测试指定草稿或已保存的 SMTP 配置。未传入草稿时，使用库内密文恢复配置；
 * probe 参数仅供单元测试替换网络握手，生产路径始终执行 smtpNoop。
 */
export async function testSmtpConfiguration(
	input?: SmtpInput,
	probe: (config: StoredSmtp) => Promise<void> = smtpNoop
): Promise<void> {
	const config = input
		? await (async (): Promise<StoredSmtp> => {
				validInput(input);
				// 清除密码后的草稿不能测试；留空则仅在服务端读取已有密文补全密码。
				if (input.clearPassword)
					throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
				const password = input.password || (await storedConfig()).password;
				return { ...input, password };
			})()
		: await storedConfig();
	await probe(config);
}

export async function deliverMail(input: {
	to: string;
	template: string;
	verificationUrl?: string;
	resetUrl?: string;
	confirmationUrl?: string;
}): Promise<void> {
	const smtp = await prisma.smtpConfiguration.findUnique({
		where: { id: GLOBAL_ID },
		select: { smtpEverConfigured: true }
	});
	if (smtp?.smtpEverConfigured) {
		const config = await storedConfig();
		const url = input.verificationUrl ?? input.resetUrl ?? input.confirmationUrl;
		if (!url) throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
		const subject =
			input.template === 'password-reset'
				? '重置密码'
				: input.template === 'change-email'
					? '确认邮箱换绑'
					: '验证邮箱';
		await smtpSend(
			config,
			input.to,
			subject,
			`${subject}链接：\n${url}\n\n如非本人操作，请忽略此邮件。`
		);
		return;
	}
	if (MAIL_DELIVERY_MODE === 'disabled' || MAIL_DELIVERY_MODE === 'test') return;
	if (MAIL_DELIVERY_MODE !== 'webhook' || !MAIL_DELIVERY_WEBHOOK_URL)
		throw new ServiceError('SMTP_CONFIGURATION_INVALID', 'SMTP 配置无效');
	const response = await fetch(MAIL_DELIVERY_WEBHOOK_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(MAIL_DELIVERY_WEBHOOK_AUTHORIZATION
				? { authorization: MAIL_DELIVERY_WEBHOOK_AUTHORIZATION }
				: {})
		},
		body: JSON.stringify(input),
		signal: AbortSignal.timeout(SMTP_TIMEOUT)
	});
	if (!response.ok) throw new Error('邮件投递失败');
}
