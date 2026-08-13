/**
 * 数据库种子脚本
 *
 * 保留为幂等初始化入口；首位管理员由首个有效注册事务创建。
 * 执行方式：npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { createDatabaseAdapter } from '../src/lib/database-adapter.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL 未设置');

const adapter = createDatabaseAdapter(databaseUrl);

const prisma = new PrismaClient({ adapter });

async function main() {
	console.log('种子数据初始化完成；未创建账号。');
}

main()
	.catch((e) => {
		console.error('种子脚本执行失败：', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
