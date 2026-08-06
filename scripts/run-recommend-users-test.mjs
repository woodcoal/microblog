/* global process */

import { spawnSync } from 'node:child_process';

const env = {
	...process.env,
	DATABASE_PROVIDER: 'sqlite',
	DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'file:./prisma/recommend-users-test.db'
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['exec', 'prisma', 'generate']);
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run(process.execPath, ['--import=tsx', '--test', 'tests/recommend-users.service.test.ts']);
