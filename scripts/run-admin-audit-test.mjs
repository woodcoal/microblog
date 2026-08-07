/* global process */
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const databasePath = 'prisma/admin-audit-test.db';
rmSync(databasePath, { force: true });
const env = { ...process.env, DATABASE_PROVIDER: 'sqlite', DATABASE_URL: `file:./${databasePath}` };

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['exec', 'prisma', 'generate']);
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run(process.execPath, ['--import=tsx', '--test', 'tests/admin-audit.service.test.ts']);
rmSync(databasePath, { force: true });
