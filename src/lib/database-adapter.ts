import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { DATABASE_PROVIDER, type DatabaseProvider } from './config';

function assertUrlMatchesProvider(provider: DatabaseProvider, url: string): void {
	if (provider === 'sqlite' && !url.startsWith('file:')) {
		throw new Error('SQLite 模式要求 DATABASE_URL 以 file: 开头');
	}

	if (provider === 'mysql' && !url.startsWith('mysql://')) {
		throw new Error('MySQL 模式要求 DATABASE_URL 以 mysql:// 开头');
	}
}

/** 根据 DATABASE_PROVIDER 创建与当前 Prisma Client 匹配的 driver adapter。 */
export function createDatabaseAdapter(url: string, provider = DATABASE_PROVIDER) {
	assertUrlMatchesProvider(provider, url);

	return provider === 'sqlite' ? new PrismaLibSql({ url }) : new PrismaMariaDb(url);
}
