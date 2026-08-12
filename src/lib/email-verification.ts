/** 邮箱验证令牌与投递适配器。令牌明文仅在创建时进入邮件链接，不会写入数据库或日志。 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import {
	EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
	EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
	MAIL_DELIVERY_MODE,
	MAIL_DELIVERY_WEBHOOK_AUTHORIZATION,
	MAIL_DELIVERY_WEBHOOK_URL,
	SITE_URL
} from '@/lib/config';

const PURPOSE = 'verify_email';
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function hashEmailVerificationToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function createRawToken(): string {
	return randomBytes(32).toString('base64url');
}

function verificationUrl(token: string): string {
	return new URL(`/verify-email?token=${encodeURIComponent(token)}`, SITE_URL).toString();
}

/** 默认禁用投递；webhook 模式以运行期机密调用既有邮件网关。 */
async function deliverVerificationEmail(email: string, token: string): Promise<void> {
	if (MAIL_DELIVERY_MODE === 'disabled' || MAIL_DELIVERY_MODE === 'test') return;
	if (MAIL_DELIVERY_MODE !== 'webhook' || !MAIL_DELIVERY_WEBHOOK_URL) {
		throw new Error('邮件投递未配置');
	}

	const response = await fetch(MAIL_DELIVERY_WEBHOOK_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(MAIL_DELIVERY_WEBHOOK_AUTHORIZATION
				? { authorization: MAIL_DELIVERY_WEBHOOK_AUTHORIZATION }
				: {})
		},
		body: JSON.stringify({
			to: email,
			template: 'verify-email',
			verificationUrl: verificationUrl(token)
		}),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error('邮件投递失败');
}

export async function issueEmailVerificationToken(user: {
	id: string;
	email: string;
}): Promise<void> {
	const token = createRawToken();
	const now = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.emailVerificationToken.updateMany({
			where: { userId: user.id, purpose: PURPOSE, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.emailVerificationToken.create({
			data: {
				userId: user.id,
				tokenHash: hashEmailVerificationToken(token),
				purpose: PURPOSE,
				expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60_000)
			}
		});
	});

	// 邮件投递是非关键副作用，不能影响注册端点的统一外部语义。
	// 失败时令牌仍可由重发流程安全轮换；不记录邮箱、令牌或凭据。
	void deliverVerificationEmail(user.email, token).catch(() => {});
}

/** 可重复调用但不会暴露邮箱或令牌是否有效；仅命中待验证用户才实际重发。 */
export async function resendEmailVerification(email: string): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true, deletedAt: true, emailVerifiedAt: true }
	});
	if (!user || user.deletedAt || user.emailVerifiedAt) return;

	const latest = await prisma.emailVerificationToken.findFirst({
		where: { userId: user.id, purpose: PURPOSE },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	if (
		latest &&
		Date.now() - latest.createdAt.getTime() < EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000
	)
		return;
	await issueEmailVerificationToken(user);
}

/** 原子消费。返回 false 时不区分无效、过期、撤销或已消费，避免状态枚举。 */
export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
	if (!SHA256_HEX.test(hashEmailVerificationToken(token))) return false;
	const now = new Date();
	const result = await prisma.$transaction(async (tx) => {
		const claimed = await tx.emailVerificationToken.updateMany({
			where: {
				tokenHash: hashEmailVerificationToken(token),
				purpose: PURPOSE,
				consumedAt: null,
				revokedAt: null,
				expiresAt: { gt: now }
			},
			data: { consumedAt: now }
		});
		if (claimed.count !== 1) return false;
		const record = await tx.emailVerificationToken.findUniqueOrThrow({
			where: { tokenHash: hashEmailVerificationToken(token) },
			select: { userId: true }
		});
		await tx.user.update({
			where: { id: record.userId },
			data: { emailVerifiedAt: now }
		});
		await tx.emailVerificationToken.updateMany({
			where: { userId: record.userId, purpose: PURPOSE, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		return true;
	});
	return result;
}
