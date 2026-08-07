/* global process */
import { rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const databasePath = 'prisma/post-detail-browser-test.db';
const port = process.env.MUTAN_E2E_PORT ?? '4321';
const baseUrl = `http://127.0.0.1:${port}`;
rmSync(databasePath, { force: true });

const env = {
	...process.env,
	DATABASE_PROVIDER: 'sqlite',
	DATABASE_URL: `file:./${databasePath}`,
	SITE_URL: baseUrl,
	MUTAN_E2E_BASE_URL: baseUrl,
	PORT: port,
	HOST: '127.0.0.1'
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForServer(child) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (child.exitCode !== null) throw new Error(`浏览器测试站点提前退出 (${child.exitCode})`);
		try {
			const response = await globalThis.fetch(baseUrl);
			if (response.ok) return;
		} catch {
			// 服务仍在启动中。
		}
		await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
	}
	throw new Error('浏览器测试站点未能在 10 秒内启动');
}

try {
	run('pnpm', ['exec', 'prisma', 'generate']);
	run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
	run('pnpm', ['exec', 'tsx', 'tests/fixtures/post-detail-browser.fixture.ts']);
	run('pnpm', ['run', 'build']);

	const server = spawn(process.execPath, ['dist/server/entry.mjs'], { env, stdio: 'inherit' });
	try {
		await waitForServer(server);
		run(process.execPath, ['--import=tsx', '--test', 'tests/post-detail-regression.browser.test.ts']);
	} finally {
		server.kill('SIGTERM');
	}
} finally {
	rmSync(databasePath, { force: true });
}
