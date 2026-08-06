/**
 * 站点文案数据库操作。
 *
 * 仅承载固定键文案及其审计版本的原子读写；键白名单和业务校验由 service 层负责。
 */
import { prisma } from '@/lib/db';

export async function findSiteCopy(key: string) {
	return prisma.siteCopy.findUnique({ where: { key } });
}

export async function findSiteCopyVersions(key: string) {
	return prisma.siteCopyVersion.findMany({
		where: { key },
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
	});
}

/** 在同一事务中更新当前值并追加不可变审计版本。 */
export async function saveSiteCopyWithVersion(input: {
	key: string;
	markdown: string;
	updatedById: string;
}) {
	return prisma.$transaction(async (tx) => {
		const current = await tx.siteCopy.upsert({
			where: { key: input.key },
			create: input,
			update: {
				markdown: input.markdown,
				updatedById: input.updatedById
			}
		});

		await tx.siteCopyVersion.create({ data: input });
		return current;
	});
}
