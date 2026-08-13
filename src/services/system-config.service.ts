/** 管理员系统配置服务。每个读取、写入和连通性测试都实时核验数据库角色。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { MAIL_DELIVERY_MODE } from '@/lib/config';
import {
	isEmailOwnershipEnabled,
	setEmailOwnershipEnabledInTransaction
} from '@/services/email-policy.service';
import {
	getSmtpConfiguration,
	saveSmtpConfiguration,
	testSmtpConfiguration,
	type SmtpInput
} from '@/services/mail-delivery.service';

type SystemConfigClient = Pick<
	typeof prisma,
	| 'user'
	| 'activityLog'
	| 'systemConfig'
	| 'emailVerificationToken'
	| 'passwordResetToken'
	| 'emailChangeToken'
	| 'smtpConfiguration'
>;

async function assertLiveAdmin(userId: string, client: SystemConfigClient = prisma): Promise<void> {
	const user = await client.user.findUnique({
		where: { id: userId },
		select: { role: true, isDisabled: true, deletedAt: true }
	});
	if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
		throw new ServiceError('FORBIDDEN', '仅管理员可操作');
}
async function audit(
	userId: string,
	action: string,
	client: SystemConfigClient = prisma
): Promise<void> {
	await client.activityLog.create({
		data: { action, actorId: userId, targetType: 'system', targetId: 'global' }
	});
}

export async function readSystemConfiguration(userId: string) {
	await assertLiveAdmin(userId);
	const config = await prisma.systemConfig.findUnique({
		where: { id: 'global' },
		select: {
			mailSubjectVerifyEmail: true,
			mailBodyVerifyEmail: true,
			mailSubjectPasswordReset: true,
			mailBodyPasswordReset: true,
			mailSubjectChangeEmail: true,
			mailBodyChangeEmail: true
		}
	});
	return {
		emailOwnershipEnabled: await isEmailOwnershipEnabled(),
		smtp: await getSmtpConfiguration(),
		mailDeliveryMode: MAIL_DELIVERY_MODE,
		mailTemplates: {
			verifyEmail: {
				subject: config?.mailSubjectVerifyEmail ?? '',
				body: config?.mailBodyVerifyEmail ?? ''
			},
			passwordReset: {
				subject: config?.mailSubjectPasswordReset ?? '',
				body: config?.mailBodyPasswordReset ?? ''
			},
			changeEmail: {
				subject: config?.mailSubjectChangeEmail ?? '',
				body: config?.mailBodyChangeEmail ?? ''
			}
		}
	};
}

/** 管理员可编辑的邮件模板字段。空字符串表示使用内置默认值。 */
export type MailTemplateInput = {
	subject: string;
	body: string;
};

export async function updateSystemConfiguration(input: {
	userId: string;
	emailOwnershipEnabled?: boolean;
	smtp?: SmtpInput;
	mailTemplates?: {
		verifyEmail?: MailTemplateInput;
		passwordReset?: MailTemplateInput;
		changeEmail?: MailTemplateInput;
	};
}) {
	await assertLiveAdmin(input.userId);
	if (input.emailOwnershipEnabled === undefined && !input.smtp && !input.mailTemplates)
		throw new ServiceError('BAD_REQUEST', '没有需要更新的配置');
	await prisma.$transaction(async (tx) => {
		if (input.emailOwnershipEnabled !== undefined)
			await setEmailOwnershipEnabledInTransaction(tx, input.emailOwnershipEnabled);
		if (input.smtp) await saveSmtpConfiguration(input.smtp, tx);
		if (input.mailTemplates) {
			const data: Record<string, string> = {};
			if (input.mailTemplates.verifyEmail) {
				data.mailSubjectVerifyEmail = input.mailTemplates.verifyEmail.subject;
				data.mailBodyVerifyEmail = input.mailTemplates.verifyEmail.body;
			}
			if (input.mailTemplates.passwordReset) {
				data.mailSubjectPasswordReset = input.mailTemplates.passwordReset.subject;
				data.mailBodyPasswordReset = input.mailTemplates.passwordReset.body;
			}
			if (input.mailTemplates.changeEmail) {
				data.mailSubjectChangeEmail = input.mailTemplates.changeEmail.subject;
				data.mailBodyChangeEmail = input.mailTemplates.changeEmail.body;
			}
			if (Object.keys(data).length > 0)
				await tx.systemConfig.upsert({
					where: { id: 'global' },
					create: { id: 'global', ...data },
					update: data
				});
		}
		await audit(input.userId, 'admin.system_config_updated', tx);
	});
	return readSystemConfiguration(input.userId);
}
export async function testSystemSmtp(userId: string, smtp?: SmtpInput): Promise<void> {
	await assertLiveAdmin(userId);
	await testSmtpConfiguration(smtp);
	await audit(userId, 'admin.smtp_tested');
}
