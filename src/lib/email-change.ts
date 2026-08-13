/**
 * 安全邮箱换绑令牌。目标邮箱与注册验证、密码重置令牌物理隔离；
 * 原始令牌只会出现在一次性确认链接中，数据库仅保存 SHA-256 摘要。
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import {
	EMAIL_CHANGE_RESEND_COOLDOWN_SECONDS,
	EMAIL_CHANGE_TOKEN_TTL_MINUTES,
	SITE_URL
} from '@/lib/config';
import { assertEmailOwnershipEnabled } from '@/services/email-policy.service';
import { deliverMail } from '@/services/mail-delivery.service';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function hashEmailChangeToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function createRawToken(): string {
	return randomBytes(32).toString('base64url');
}

function emailChangeUrl(token: string): string {
	return new URL(`/change-email?token=${encodeURIComponent(token)}`, SITE_URL).toString();
}

/**
 * 轮换当前用户尚未消费的换绑令牌。重发冷却按用户而不是邮箱计数，避免
 * 攻击者借由不同目标邮箱绕过频率限制；目标邮箱是否已经归属他人不会影响受理语义。
 */
export async function issueEmailChangeToken(input: {
	userId: string;
	targetEmail: string;
}): Promise<void> {
	await assertEmailOwnershipEnabled();
	const latest = await prisma.emailChangeToken.findFirst({
		where: { userId: input.userId },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	if (
		latest &&
		Date.now() - latest.createdAt.getTime() < EMAIL_CHANGE_RESEND_COOLDOWN_SECONDS * 1000
	)
		return;

	const token = createRawToken();
	const now = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.emailChangeToken.updateMany({
			where: { userId: input.userId, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.emailChangeToken.create({
			data: {
				userId: input.userId,
				targetEmail: input.targetEmail,
				tokenHash: hashEmailChangeToken(token),
				expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TOKEN_TTL_MINUTES * 60_000)
			}
		});
	});

	// 投递不改变端点受理语义，也不得泄漏目标邮箱或令牌到日志。
	void deliverMail({
		to: input.targetEmail,
		template: 'change-email',
		confirmationUrl: emailChangeUrl(token)
	}).catch(() => {});
}

function isEmailUniqueConstraintError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || !('code' in error)) return false;
	return (error as { code?: unknown }).code === 'P2002';
}

/**
 * 原子消费令牌、更新邮箱并撤销一切长期和短期凭据。返回 false 时不区分
 * 无效、过期、重放、撤销与确认时邮箱竞争，防止通过确认入口枚举目标邮箱状态。
 */
export async function consumeEmailChangeToken(token: string): Promise<boolean> {
	await assertEmailOwnershipEnabled();
	const tokenHash = hashEmailChangeToken(token);
	if (!SHA256_HEX.test(tokenHash)) return false;

	const now = new Date();
	try {
		return await prisma.$transaction(async (tx) => {
			const claimed = await tx.emailChangeToken.updateMany({
				where: { tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
				data: { consumedAt: now }
			});
			if (claimed.count !== 1) return false;

			const record = await tx.emailChangeToken.findUniqueOrThrow({
				where: { tokenHash },
				select: { userId: true, targetEmail: true }
			});
			await tx.user.update({
				where: { id: record.userId },
				data: { email: record.targetEmail, credentialVersion: { increment: 1 } }
			});
			await tx.apiToken.deleteMany({ where: { userId: record.userId } });
			await tx.webhook.deleteMany({ where: { userId: record.userId } });
			await tx.emailChangeToken.updateMany({
				where: { userId: record.userId, consumedAt: null, revokedAt: null },
				data: { revokedAt: now }
			});
			await tx.activityLog.create({
				data: {
					action: 'auth.email_changed',
					actorId: record.userId,
					targetType: 'user',
					targetId: record.userId,
					targetUserId: record.userId
				}
			});
			return true;
		});
	} catch (error) {
		if (!isEmailUniqueConstraintError(error)) throw error;
		// 唯一索引才是并发竞争的最终裁决者。竞争失败后撤销该链接，且不暴露原因。
		await prisma.emailChangeToken.updateMany({
			where: { tokenHash, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		return false;
	}
}
