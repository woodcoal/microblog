/* global process */
import { existsSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const databasePath = resolve('prisma/post-detail-browser-test.db');
const databaseUrl = pathToFileURL(databasePath).href;
const databaseArtifacts = [
	databasePath,
	`${databasePath}-journal`,
	`${databasePath}-shm`,
	`${databasePath}-wal`
];

function cleanupDatabase() {
	for (const artifact of databaseArtifacts) rmSync(artifact, { force: true });
}

function assertDatabaseCleaned() {
	const remaining = databaseArtifacts.filter(existsSync);
	if (remaining.length) {
		throw new Error(`浏览器回归未清理隔离数据库：${remaining.join(', ')}`);
	}
}

function run(command, args, env) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

async function findAvailablePort() {
	const probe = createServer();
	probe.listen(0, '127.0.0.1');
	await once(probe, 'listening');
	const address = probe.address();
	if (!address || typeof address === 'string') throw new Error('无法分配浏览器回归测试端口');
	const { port } = address;
	probe.close();
	await once(probe, 'close');
	return String(port);
}

async function waitForServer(child, baseUrl) {
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

async function stopServer(child) {
	const closed = once(child, 'close');
	if (child.exitCode !== null) {
		await closed;
		return;
	}
	child.kill('SIGTERM');
	const stopped = await Promise.race([
		closed,
		new Promise((resolve) => globalThis.setTimeout(resolve, 5_000))
	]);
	if (!stopped) {
		const forceClosed = once(child, 'close');
		child.kill('SIGKILL');
		await forceClosed;
	}
}

async function main() {
	const port = process.env.MUTAN_E2E_PORT ?? (await findAvailablePort());
	const baseUrl = `http://127.0.0.1:${port}`;
	const env = {
		...process.env,
		DATABASE_PROVIDER: 'sqlite',
		// Prisma CLI 与运行时 libSQL adapter 必须使用同一绝对 file URL。
		DATABASE_URL: databaseUrl,
		SITE_URL: baseUrl,
		MUTAN_E2E_BASE_URL: baseUrl,
		PORT: port,
		HOST: '127.0.0.1'
	};
	cleanupDatabase();
	try {
		run('pnpm', ['exec', 'prisma', 'generate'], env);
		run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], env);
		run('pnpm', ['exec', 'tsx', 'tests/fixtures/post-detail-browser.fixture.ts'], env);
		run('pnpm', ['run', 'build'], env);

		const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
			env,
			stdio: 'inherit'
		});
		try {
			await waitForServer(server, baseUrl);
			run(
				process.execPath,
				['--import=tsx', '--test', 'tests/post-detail-regression.browser.test.ts'],
				env
			);
		} finally {
			await stopServer(server);
		}
	} finally {
		cleanupDatabase();
		assertDatabaseCleaned();
	}
}

await main();
