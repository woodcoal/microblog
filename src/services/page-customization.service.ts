/** 公开页统计脚本配置。原始脚本只允许管理员在服务端读取或写入。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';

const MAX_ANALYTICS_SCRIPT_BYTES = 64 * 1024;

async function assertLiveAdmin(userId: string): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { role: true, isDisabled: true, deletedAt: true }
	});
	if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
		throw new ServiceError('FORBIDDEN', '仅管理员可操作');
}

function validateInput(input: { publicAnalyticsScript: string }): void {
	if (
		new TextEncoder().encode(input.publicAnalyticsScript).byteLength >
		MAX_ANALYTICS_SCRIPT_BYTES
	)
		throw new ServiceError('BAD_REQUEST', '统计脚本不能超过 64 KiB');
}

/** 管理端读取。非管理员不能探测统计脚本内容。 */
export async function readPageCustomization(userId: string) {
	await assertLiveAdmin(userId);
	const config = await prisma.systemConfig.findUnique({
		where: { id: 'global' },
		select: { publicAnalyticsScript: true }
	});
	return { publicAnalyticsScript: config?.publicAnalyticsScript ?? '' };
}

/** 仅供公开 SSR 布局调用，绝不经由 HTTP API 或管理端传输原始脚本。 */
export async function getPublicAnalyticsScript(): Promise<string> {
	try {
		const config = await prisma.systemConfig.findUnique({
			where: { id: 'global' },
			select: { publicAnalyticsScript: true }
		});
		return config?.publicAnalyticsScript ?? '';
	} catch {
		return '';
	}
}

/** 管理端写入统计脚本与审计记录。 */
export async function updatePageCustomization(input: {
	userId: string;
	publicAnalyticsScript: string;
}) {
	await assertLiveAdmin(input.userId);
	validateInput(input);
	return prisma.$transaction(async (tx) => {
		const user = await tx.user.findUnique({
			where: { id: input.userId },
			select: { role: true, isDisabled: true, deletedAt: true }
		});
		if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
			throw new ServiceError('FORBIDDEN', '仅管理员可操作');

		const config = await tx.systemConfig.upsert({
			where: { id: 'global' },
			create: { id: 'global', publicAnalyticsScript: input.publicAnalyticsScript },
			update: { publicAnalyticsScript: input.publicAnalyticsScript }
		});
		await tx.activityLog.create({
			data: {
				action: 'admin.page_customization_updated',
				actorId: input.userId,
				targetType: 'system',
				targetId: 'global'
			}
		});
		return { publicAnalyticsScript: config.publicAnalyticsScript };
	});
}
