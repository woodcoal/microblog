/**
 * Prisma Client 单例（Prisma 7 适配）
 *
 * Prisma 7 使用 driver adapter 模式连接数据库。
 * 根据 DATABASE_PROVIDER 使用 libSQL（SQLite）或 MariaDB（MySQL）adapter。
 *
 * 开发环境避免热重载创建过多连接，
 * 生产环境直接创建新实例。
 */
import { PrismaClient } from '../../generated/prisma/client';
import { DATABASE_URL } from './config';
import { createDatabaseAdapter } from './database-adapter';

/** 数据库文件路径（统一从 config.ts 读取） */
const DB_URL = DATABASE_URL;

/**
 * 创建 PrismaClient 实例
 *
 * 根据 DATABASE_PROVIDER 创建对应的 driver adapter。
 *
 * @returns PrismaClient 实例
 */
export function createPrismaClient(databaseUrl = DB_URL): PrismaClient {
	const adapter = createDatabaseAdapter(databaseUrl);
	return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
