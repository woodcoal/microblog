/**
 * 站点文案数据库操作。
 *
 * 仅承载固定键文案及其审计版本的原子读写；键白名单和业务校验由 service 层负责。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

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
		return saveSiteCopyWithVersionInTransaction(tx, input);
	});
}

/** 与其他全局配置合并时复用同一个事务，保持当前值与版本审计一致。 */
export async function saveSiteCopyWithVersionInTransaction(
	tx: Prisma.TransactionClient,
	input: { key: string; markdown: string; updatedById: string }
) {
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
}
