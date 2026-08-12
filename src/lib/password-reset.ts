/** 密码重置令牌。与邮箱验证令牌隔离，原文只进入邮件投递请求。 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import {
	MAIL_DELIVERY_MODE,
	MAIL_DELIVERY_WEBHOOK_AUTHORIZATION,
	MAIL_DELIVERY_WEBHOOK_URL,
	PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS,
	PASSWORD_RESET_TOKEN_TTL_MINUTES,
	SITE_URL
} from '@/lib/config';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function hashPasswordResetToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function createRawToken(): string {
	return randomBytes(32).toString('base64url');
}

function resetUrl(token: string): string {
	return new URL(`/reset-password?token=${encodeURIComponent(token)}`, SITE_URL).toString();
}

async function deliverPasswordResetEmail(email: string, token: string): Promise<void> {
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
			template: 'password-reset',
			resetUrl: resetUrl(token)
		}),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error('邮件投递失败');
}

/**
 * 总是静默接受请求。对真实账号，限频后撤销旧未消费令牌并发出一枚新令牌；
 * 对不存在、禁用或未验证账号不写入任何记录，外部响应保持一致。
 */
export async function requestPasswordReset(email: string): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true, isDisabled: true, emailVerifiedAt: true }
	});
	if (!user || user.isDisabled || !user.emailVerifiedAt) return;

	const latest = await prisma.passwordResetToken.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	if (
		latest &&
		Date.now() - latest.createdAt.getTime() < PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS * 1000
	)
		return;

	const token = createRawToken();
	const now = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.passwordResetToken.updateMany({
			where: { userId: user.id, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.passwordResetToken.create({
			data: {
				userId: user.id,
				tokenHash: hashPasswordResetToken(token),
				expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000)
			}
		});
	});

	try {
		await deliverPasswordResetEmail(user.email, token);
	} catch (error) {
		// 投递是非关键副作用。不得让网关状态成为账号存在性的外部信号；
		// 日志不包含邮箱、令牌或投递 URL，供运行环境的日志告警规则捕获。
		console.error(
			JSON.stringify({
				event: 'auth.password_reset_delivery_failed',
				errorType: error instanceof Error ? error.name : 'unknown'
			})
		);
	}
}

/**
 * 原子消费有效令牌并撤销既有持久凭据。false 不区分无效、过期、撤销、已消费，
 * 因而可安全映射为各入口一致的错误。
 */
export async function consumePasswordResetToken(
	token: string,
	passwordHash: string
): Promise<boolean> {
	const tokenHash = hashPasswordResetToken(token);
	if (!SHA256_HEX.test(tokenHash)) return false;

	const now = new Date();
	return prisma.$transaction(async (tx) => {
		const claimed = await tx.passwordResetToken.updateMany({
			where: { tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
			data: { consumedAt: now }
		});
		if (claimed.count !== 1) return false;

		const record = await tx.passwordResetToken.findUniqueOrThrow({
			where: { tokenHash },
			select: { userId: true }
		});
		await tx.user.update({
			where: { id: record.userId },
			data: { passwordHash, credentialVersion: { increment: 1 } }
		});
		await tx.apiToken.deleteMany({ where: { userId: record.userId } });
		await tx.webhook.deleteMany({ where: { userId: record.userId } });
		await tx.activityLog.create({
			data: {
				action: 'auth.password_reset',
				actorId: record.userId,
				targetType: 'user',
				targetId: record.userId,
				targetUserId: record.userId
			}
		});
		await tx.passwordResetToken.updateMany({
			where: { userId: record.userId, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		return true;
	});
}
