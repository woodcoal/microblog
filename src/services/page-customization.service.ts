/** 公开页自定义配置。原始统计脚本只允许管理员在服务端读取或写入。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { renderSiteCopyMarkdown } from '@/lib/markdown';

const FOOTER_KEY = 'global.footer';
const MAX_FOOTER_LENGTH = 4000;
const MAX_ANALYTICS_SCRIPT_BYTES = 64 * 1024;

async function assertLiveAdmin(userId: string): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { role: true, isDisabled: true, deletedAt: true }
	});
	if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
		throw new ServiceError('FORBIDDEN', '仅管理员可操作');
}

function validateInput(input: { footerMarkdown?: string; publicAnalyticsScript?: string }): void {
	if (input.footerMarkdown === undefined && input.publicAnalyticsScript === undefined)
		throw new ServiceError('BAD_REQUEST', '至少提供一项页面自定义配置');
	if (input.footerMarkdown !== undefined && input.footerMarkdown.length > MAX_FOOTER_LENGTH)
		throw new ServiceError('BAD_REQUEST', '页脚文案不能超过 4000 个字符');
	if (
		input.publicAnalyticsScript !== undefined &&
		new TextEncoder().encode(input.publicAnalyticsScript).byteLength >
			MAX_ANALYTICS_SCRIPT_BYTES
	)
		throw new ServiceError('BAD_REQUEST', '统计脚本不能超过 64 KiB');
}

function toResponse(input: {
	footer: { markdown: string; updatedAt: Date } | null;
	publicAnalyticsScript: string;
}) {
	const markdown = input.footer?.markdown ?? '';
	return {
		footer: {
			markdown,
			html: renderSiteCopyMarkdown(markdown),
			updatedAt: input.footer?.updatedAt.toISOString() ?? null
		},
		publicAnalyticsScript: input.publicAnalyticsScript
	};
}

/** 管理端读取。非管理员不能探测页脚或统计脚本内容。 */
export async function readPageCustomization(userId: string) {
	await assertLiveAdmin(userId);
	const [footer, config] = await Promise.all([
		prisma.siteCopy.findUnique({ where: { key: FOOTER_KEY } }),
		prisma.systemConfig.findUnique({
			where: { id: 'global' },
			select: { publicAnalyticsScript: true }
		})
	]);
	return toResponse({ footer, publicAnalyticsScript: config?.publicAnalyticsScript ?? '' });
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

/** 管理端写入。页脚当前值、版本、脚本与审计记录以一个事务提交。 */
export async function updatePageCustomization(input: {
	userId: string;
	footerMarkdown?: string;
	publicAnalyticsScript?: string;
}) {
	await assertLiveAdmin(input.userId);
	validateInput(input);
	const result = await prisma.$transaction(async (tx) => {
		const user = await tx.user.findUnique({
			where: { id: input.userId },
			select: { role: true, isDisabled: true, deletedAt: true }
		});
		if (!user || user.role !== 'admin' || user.isDisabled || user.deletedAt)
			throw new ServiceError('FORBIDDEN', '仅管理员可操作');

		let footer = await tx.siteCopy.findUnique({ where: { key: FOOTER_KEY } });
		if (input.footerMarkdown !== undefined) {
			footer = await tx.siteCopy.upsert({
				where: { key: FOOTER_KEY },
				create: {
					key: FOOTER_KEY,
					markdown: input.footerMarkdown,
					updatedById: input.userId
				},
				update: { markdown: input.footerMarkdown, updatedById: input.userId }
			});
			await tx.siteCopyVersion.create({
				data: { key: FOOTER_KEY, markdown: input.footerMarkdown, updatedById: input.userId }
			});
		}
		const config = await tx.systemConfig.upsert({
			where: { id: 'global' },
			create: { id: 'global', publicAnalyticsScript: input.publicAnalyticsScript ?? '' },
			update:
				input.publicAnalyticsScript === undefined
					? {}
					: { publicAnalyticsScript: input.publicAnalyticsScript }
		});
		await tx.activityLog.create({
			data: {
				action: 'admin.page_customization_updated',
				actorId: input.userId,
				targetType: 'system',
				targetId: 'global'
			}
		});
		return toResponse({ footer, publicAnalyticsScript: config.publicAnalyticsScript });
	});
	return result;
}
