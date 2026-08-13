/** 全部入口共用的邮箱所有权策略。读取数据库，不缓存开关。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';

const GLOBAL_ID = 'global';

export async function isEmailOwnershipEnabled(): Promise<boolean> {
	const config = await prisma.systemConfig.findUnique({
		where: { id: GLOBAL_ID },
		select: { emailOwnershipEnabled: true }
	});
	return config?.emailOwnershipEnabled ?? true;
}

export async function assertEmailOwnershipEnabled(
	kind: 'reset' | 'other' = 'other'
): Promise<void> {
	if (await isEmailOwnershipEnabled()) return;
	throw new ServiceError(
		'EMAIL_OWNERSHIP_DISABLED',
		kind === 'reset' ? '联系管理员处理' : '与管理员联系处理'
	);
}

export async function assertUserMayAuthenticate(user: {
	emailVerifiedAt: Date | null;
	emailVerificationRequired: boolean;
}): Promise<void> {
	if (!(await isEmailOwnershipEnabled())) return;
	if (user.emailVerificationRequired && !user.emailVerifiedAt) {
		throw new ServiceError('FORBIDDEN', '请先完成邮箱验证');
	}
}

/** 关闭时在同一事务撤销所有尚未消费的邮箱所有权令牌。 */
export async function setEmailOwnershipEnabled(enabled: boolean): Promise<void> {
	const now = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.systemConfig.upsert({
			where: { id: GLOBAL_ID },
			create: { id: GLOBAL_ID, emailOwnershipEnabled: enabled },
			update: { emailOwnershipEnabled: enabled }
		});
		if (!enabled) {
			await Promise.all([
				tx.emailVerificationToken.updateMany({
					where: { consumedAt: null, revokedAt: null },
					data: { revokedAt: now }
				}),
				tx.passwordResetToken.updateMany({
					where: { consumedAt: null, revokedAt: null },
					data: { revokedAt: now }
				}),
				tx.emailChangeToken.updateMany({
					where: { consumedAt: null, revokedAt: null },
					data: { revokedAt: now }
				})
			]);
		}
	});
}

export const EMAIL_POLICY_GLOBAL_ID = GLOBAL_ID;
