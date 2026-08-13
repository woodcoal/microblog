/** 管理员系统配置服务。每个读取、写入和连通性测试都实时核验数据库角色。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { isEmailOwnershipEnabled, setEmailOwnershipEnabled } from '@/services/email-policy.service';
import {
	getSmtpConfiguration,
	saveSmtpConfiguration,
	testSmtpConfiguration,
	type SmtpInput
} from '@/services/mail-delivery.service';

async function assertLiveAdmin(userId: string): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { role: true, isDisabled: true, deletedAt: true }
	});
	if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
		throw new ServiceError('FORBIDDEN', '仅管理员可操作');
}
async function audit(userId: string, action: string): Promise<void> {
	await prisma.activityLog.create({
		data: { action, actorId: userId, targetType: 'system', targetId: 'global' }
	});
}

export async function readSystemConfiguration(userId: string) {
	await assertLiveAdmin(userId);
	return {
		emailOwnershipEnabled: await isEmailOwnershipEnabled(),
		smtp: await getSmtpConfiguration()
	};
}
export async function updateSystemConfiguration(input: {
	userId: string;
	emailOwnershipEnabled?: boolean;
	smtp?: SmtpInput;
}) {
	await assertLiveAdmin(input.userId);
	if (input.emailOwnershipEnabled === undefined && !input.smtp)
		throw new ServiceError('BAD_REQUEST', '没有需要更新的配置');
	if (input.emailOwnershipEnabled !== undefined)
		await setEmailOwnershipEnabled(input.emailOwnershipEnabled);
	if (input.smtp) await saveSmtpConfiguration(input.smtp);
	await audit(input.userId, 'admin.system_config_updated');
	return readSystemConfiguration(input.userId);
}
export async function testSystemSmtp(userId: string, smtp?: SmtpInput): Promise<void> {
	await assertLiveAdmin(userId);
	await testSmtpConfiguration(smtp);
	await audit(userId, 'admin.smtp_tested');
}
