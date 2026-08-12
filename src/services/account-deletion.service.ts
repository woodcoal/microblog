/** 不可恢复的账号注销编排。所有可见性和凭据状态在同一事务内收敛。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { verifyPassword } from '@/lib/auth';

export interface DeleteAccountInput {
	userId: string;
	currentPassword: string;
}

/**
 * 删除只接受已验证、正常账号的当前密码确认。User 保留为墓碑，用户名与邮箱的
 * 唯一索引和 UsernameClaim 因而继续占用；帖子软删除，评论和审计引用不物理删除。
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { id: input.userId },
		select: { passwordHash: true, isDisabled: true, deletedAt: true, emailVerifiedAt: true }
	});
	if (!user || user.isDisabled || user.deletedAt || !user.emailVerifiedAt) {
		throw new ServiceError('UNAUTHORIZED', '请先登录');
	}
	if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
		throw new ServiceError('UNAUTHORIZED', '当前密码错误');
	}

	const now = new Date();
	const deleted = await prisma.$transaction(async (tx) => {
		// 条件更新同时裁决并发注销、管理员禁用和已注销状态，避免半完成状态。
		const claimed = await tx.user.updateMany({
			where: {
				id: input.userId,
				isDisabled: false,
				deletedAt: null,
				emailVerifiedAt: { not: null }
			},
			data: { isDisabled: true, deletedAt: now, credentialVersion: { increment: 1 } }
		});
		if (claimed.count !== 1) return false;

		await tx.post.updateMany({
			where: { userId: input.userId, isDeleted: false },
			data: { isDeleted: true, deleteReason: 'account_deleted' }
		});
		await tx.apiToken.deleteMany({ where: { userId: input.userId } });
		await tx.webhook.deleteMany({ where: { userId: input.userId } });
		await tx.passwordResetToken.updateMany({
			where: { userId: input.userId, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.emailChangeToken.updateMany({
			where: { userId: input.userId, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.emailVerificationToken.updateMany({
			where: { userId: input.userId, consumedAt: null, revokedAt: null },
			data: { revokedAt: now }
		});
		await tx.activityLog.create({
			data: {
				action: 'auth.account_deleted',
				actorId: input.userId,
				targetType: 'user',
				targetId: input.userId,
				targetUserId: input.userId
			}
		});
		return true;
	});
	if (!deleted) throw new ServiceError('UNAUTHORIZED', '请先登录');
}
