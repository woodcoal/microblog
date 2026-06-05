/**
 * Prisma 7 配置文件
 *
 * Prisma 7 将数据库连接 URL 从 schema.prisma 移到此配置文件。
 * 使用 dotenv 加载 .env 环境变量。
 */
import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

type Env = {
	DATABASE_URL: string;
};

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		url: env<Env>('DATABASE_URL')
	}
});
