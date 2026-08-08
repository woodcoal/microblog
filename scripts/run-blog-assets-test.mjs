/* global console, process */
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
if (!['sqlite', 'mysql'].includes(provider)) {
	throw new Error('DATABASE_PROVIDER 必须是 sqlite 或 mysql');
}

const databasePath = provider === 'sqlite' ? 'prisma/blog-assets-test.db' : undefined;
const databaseUrl = provider === 'mysql' ? process.env.TEST_DATABASE_URL : 'file:./' + databasePath;

if (provider === 'mysql' && !databaseUrl?.startsWith('mysql://')) {
	throw new Error('MySQL 媒体测试必须设置 TEST_DATABASE_URL=mysql://...，且该库必须与生产库隔离');
}

if (databasePath) rmSync(databasePath, { force: true });
const env = {
	...process.env,
	DATABASE_PROVIDER: provider,
	DATABASE_URL: databaseUrl,
	...(provider === 'mysql' ? { TEST_DATABASE_URL: databaseUrl } : {})
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) {
		throw result.error ?? new Error(command + ' ' + args.join(' ') + ' 执行失败');
	}
}

try {
	run('pnpm', ['exec', 'prisma', 'generate']);
	run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
	run(process.execPath, ['--import=tsx', '--test', 'tests/blog-assets.service.test.ts']);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	if (databasePath) rmSync(databasePath, { force: true });
}
