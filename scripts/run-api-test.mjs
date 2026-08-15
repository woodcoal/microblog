/* global process */

import { spawnSync } from 'node:child_process';

const suites = {
	'api-v1': {
		testFile: 'tests/api-v1.acceptance.test.ts',
		rateLimits: { API_RATE_LIMIT_READ: '1000', API_RATE_LIMIT_WRITE: '100' }
	},
	'api-agent': {
		testFile: 'tests/agent-api.acceptance.test.ts',
		rateLimits: {
			API_RATE_LIMIT_READ: '1000',
			API_RATE_LIMIT_WRITE: '1000',
			API_RATE_LIMIT_UPLOAD: '1000',
			API_UPLOAD_BODY_LIMIT_BYTES: '1024'
		}
	},
	'admin-auth': {
		testFile: 'tests/admin-authorization.acceptance.test.ts',
		rateLimits: {
			API_RATE_LIMIT_READ: '1000',
			API_RATE_LIMIT_WRITE: '1000',
			API_RATE_LIMIT_UPLOAD: '1000'
		}
	},
	'password-reset-delivery-failure': {
		testFile: 'tests/password-reset-delivery-failure.acceptance.test.ts',
		rateLimits: { API_RATE_LIMIT_READ: '1000', API_RATE_LIMIT_WRITE: '1000' }
	}
};

const [suite] = process.argv.slice(2);
const config = suites[suite];
const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();

if (!config) {
	throw new Error(`测试套件必须是 ${Object.keys(suites).join('、')}`);
}

if (!['sqlite', 'mysql'].includes(provider)) {
	throw new Error('DATABASE_PROVIDER 必须是 sqlite 或 mysql');
}

const databaseUrl =
	process.env.TEST_DATABASE_URL ??
	(provider === 'sqlite' ? `file:./prisma/${suite}-acceptance.db` : '');

if (!databaseUrl) {
	throw new Error('MySQL 验收测试必须设置 TEST_DATABASE_URL，且该库必须与生产库隔离');
}

const env = {
	...process.env,
	DATABASE_PROVIDER: provider,
	DATABASE_URL: databaseUrl,
	API_AGENT_KEY: process.env.API_AGENT_KEY || 'agent-api-test-key',
	...config.rateLimits
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['exec', 'prisma', 'generate']);
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run(process.execPath, ['--import=tsx', '--test', config.testFile]);
