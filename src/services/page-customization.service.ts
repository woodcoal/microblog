/** 公开页面定制服务。所有写入由管理员实时身份和同一事务约束。 */
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { renderSiteCopyMarkdown } from '@/lib/markdown';
import { findSiteCopy, saveSiteCopyWithVersionInTransaction } from '@/lib/site-copy';
import { DEFAULT_SITE_COPY } from '@/lib/site-copy-definitions';

const GLOBAL_ID = 'global';
const FOOTER_KEY = 'global.footer';
const MAX_FOOTER_LENGTH = 4000;
const MAX_ANALYTICS_SCRIPT_BYTES = 64 * 1024;

export type PageCustomization = {
	footer: { markdown: string; html: string; updatedAt: string | null };
	publicAnalyticsScript: string;
};

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
		throw new ServiceError('BAD_REQUEST', '至少提供一项页面配置');
	if (input.footerMarkdown !== undefined && input.footerMarkdown.length > MAX_FOOTER_LENGTH)
		throw new ServiceError('BAD_REQUEST', '页脚文案不能超过 4000 个字符');
	if (
		input.publicAnalyticsScript !== undefined &&
		new TextEncoder().encode(input.publicAnalyticsScript).byteLength >
			MAX_ANALYTICS_SCRIPT_BYTES
	)
		throw new ServiceError('BAD_REQUEST', '公开统计脚本不能超过 64 KiB');
}

async function readRaw(): Promise<PageCustomization> {
	const [footer, config] = await Promise.all([
		findSiteCopy(FOOTER_KEY),
		prisma.systemConfig.findUnique({
			where: { id: GLOBAL_ID },
			select: { publicAnalyticsScript: true }
		})
	]);
	const markdown = footer?.markdown ?? DEFAULT_SITE_COPY[FOOTER_KEY];
	return {
		footer: {
			markdown,
			html: renderSiteCopyMarkdown(markdown),
			updatedAt: footer?.updatedAt.toISOString() ?? null
		},
		publicAnalyticsScript: config?.publicAnalyticsScript ?? ''
	};
}

/** 管理端读取当前配置；不允许匿名或普通用户获知统计脚本。 */
export async function readPageCustomization(userId: string): Promise<PageCustomization> {
	await assertLiveAdmin(userId);
	return readRaw();
}

/** 供 SSR 布局内部使用。页面读取失败时降级为空，避免配置错误影响公开页。 */
export async function readPublicPageCustomization(): Promise<PageCustomization> {
	try {
		return await readRaw();
	} catch {
		const markdown = DEFAULT_SITE_COPY[FOOTER_KEY];
		return {
			footer: { markdown, html: renderSiteCopyMarkdown(markdown), updatedAt: null },
			publicAnalyticsScript: ''
		};
	}
}

export async function updatePageCustomization(input: {
	userId: string;
	footerMarkdown?: string;
	publicAnalyticsScript?: string;
}): Promise<PageCustomization> {
	await assertLiveAdmin(input.userId);
	validateInput(input);
	await prisma.$transaction(async (tx) => {
		if (input.footerMarkdown !== undefined)
			await saveSiteCopyWithVersionInTransaction(tx, {
				key: FOOTER_KEY,
				markdown: input.footerMarkdown,
				updatedById: input.userId
			});
		if (input.publicAnalyticsScript !== undefined)
			await tx.systemConfig.upsert({
				where: { id: GLOBAL_ID },
				create: { id: GLOBAL_ID, publicAnalyticsScript: input.publicAnalyticsScript },
				update: { publicAnalyticsScript: input.publicAnalyticsScript }
			});
		await tx.activityLog.create({
			data: {
				action: 'admin.page_customization_updated',
				actorId: input.userId,
				targetType: 'system',
				targetId: GLOBAL_ID
			}
		});
	});
	return readPageCustomization(input.userId);
}
