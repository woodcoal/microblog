/**
 * Prisma Client 单例（Prisma 7 适配）
 *
 * Prisma 7 使用 driver adapter 模式连接数据库。
 * 使用 @prisma/adapter-mariadb 连接 MySQL。
 *
 * 开发环境避免热重载创建过多连接，
 * 生产环境直接创建新实例。
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client';
import { DATABASE_URL } from './config';

/** 数据库文件路径（统一从 config.ts 读取） */
const DB_URL = DATABASE_URL;

/**
 * 创建 PrismaClient 实例
 *
 * 使用 MariaDB driver adapter 连接 MySQL 数据库。
 *
 * @returns PrismaClient 实例
 */
function createPrismaClient(): PrismaClient {
	const adapter = new PrismaMariaDb(DB_URL);
	return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
