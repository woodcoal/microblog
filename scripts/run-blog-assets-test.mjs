/* global process */
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'file:./prisma/blog-assets-test.db';
// 该回归只运行服务端测试；无锁文件时 pnpm 可能重新安装依赖，避免无谓下载浏览器。
const env = {
	...process.env,
	DATABASE_PROVIDER: 'sqlite',
	DATABASE_URL: databaseUrl,
	PUPPETEER_SKIP_DOWNLOAD: 'true'
};
for (const [command, args] of [
	['pnpm', ['exec', 'prisma', 'generate']],
	['pnpm', ['exec', 'prisma', 'migrate', 'deploy']],
	[
		process.execPath,
		[
			'--import=tsx',
			'--test',
			'tests/blog-assets.service.test.ts',
			'tests/blog-assets-ui.test.ts'
		]
	]
]) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
