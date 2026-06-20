/**
 * 用户设置数据库操作模块
 *
 * 提供用户设置（UserSettings）的 CRUD 原子操作，供 Service 层调用。
 * 所有 Prisma 数据库访问均收敛于此模块，Service 层不再直接操作 prisma。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/**
 * 查询用户设置
 *
 * 根据 userId 查找 UserSettings 记录，支持通过 select 指定返回字段。
 * 若该用户尚无设置记录，返回 null。
 *
 * @param userId - 用户 ID
 * @param select - 可选，Prisma select 对象，控制返回字段
 * @returns UserSettings 记录或 null
 */
export async function findUserSettings<T extends Prisma.UserSettingsSelect>(
	userId: string,
	select?: T
) {
	return prisma.userSettings.findUnique({
		where: { userId },
		...(select ? { select } : {})
	});
}

/**
 * 更新或创建用户设置
 *
 * 若该 userId 已有 UserSettings 记录则更新，否则创建新记录。
 * update 和 create 参数分别对应 Prisma upsert 的 update / create 子句。
 * 使用 Unchecked 类型以支持直接传递原始字段（如 userId、theme），
 * 而非嵌套关联对象。
 *
 * @param userId - 用户 ID（作为 upsert 的唯一键）
 * @param update - 更新数据（Prisma UserSettingsUncheckedUpdateInput 子集）
 * @param create - 创建数据（Prisma UserSettingsUncheckedCreateInput 子集）
 * @returns 更新或创建后的完整 UserSettings 记录
 */
export async function upsertUserSettings(
	userId: string,
	update: Prisma.UserSettingsUncheckedUpdateInput,
	create: Prisma.UserSettingsUncheckedCreateInput
) {
	return prisma.userSettings.upsert({
		where: { userId },
		update,
		create
	});
}
