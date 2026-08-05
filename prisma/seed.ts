/**
 * 数据库种子脚本
 *
 * 创建初始管理员账号。
 * 执行方式：npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { createDatabaseAdapter } from '../src/lib/database-adapter.js';
import bcrypt from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL 未设置');

const adapter = createDatabaseAdapter(databaseUrl);

const prisma = new PrismaClient({ adapter });

async function main() {
	// 创建初始管理员账号（仅当不存在时）
	const adminEmail = 'admin@mutan.vip';
	const existingAdmin = await prisma.user.findUnique({
		where: { email: adminEmail }
	});

	if (!existingAdmin) {
		const passwordHash = await bcrypt.hash('admin123', 10);
		await prisma.user.create({
			data: {
				username: 'mutan',
				displayName: '管理员',
				email: adminEmail,
				passwordHash,
				role: 'admin'
			}
		});
		console.log('已创建管理员账号：admin@mutan.vip / admin123');
	} else {
		console.log('管理员账号已存在，跳过创建');
	}

	console.log('种子数据初始化完成');
}

main()
	.catch((e) => {
		console.error('种子脚本执行失败：', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
