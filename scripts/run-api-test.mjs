/* global process */

import { spawnSync } from 'node:child_process';

const [suite] = process.argv.slice(2);
const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();

if (!['sqlite', 'mysql'].includes(provider)) {
	throw new Error('DATABASE_PROVIDER 必须是 sqlite 或 mysql');
}

const testFile =
	suite === 'api-v1'
		? 'tests/api-v1.acceptance.test.ts'
		: suite === 'api-agent'
			? 'tests/agent-api.acceptance.test.ts'
			: undefined;

if (!testFile) throw new Error('测试套件必须是 api-v1 或 api-agent');

const defaultSqliteUrl = `file:./prisma/${suite}-acceptance.db`;
const databaseUrl =
	process.env.TEST_DATABASE_URL ?? (provider === 'sqlite' ? defaultSqliteUrl : '');

if (!databaseUrl) {
	throw new Error('MySQL 验收测试必须设置 TEST_DATABASE_URL，且该库必须与生产库隔离');
}

const rateLimits =
	suite === 'api-v1'
		? { API_RATE_LIMIT_READ: '3', API_RATE_LIMIT_WRITE: '100' }
		: {
				API_RATE_LIMIT_READ: '1000',
				API_RATE_LIMIT_WRITE: '1000',
				API_RATE_LIMIT_UPLOAD: '1000'
			};
const env = {
	...process.env,
	DATABASE_PROVIDER: provider,
	DATABASE_URL: databaseUrl,
	...rateLimits
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['exec', 'prisma', 'generate']);
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run(process.execPath, ['--import=tsx', '--test', testFile]);
