/* global URL, console, process */

import { spawnSync } from 'node:child_process';

const provider = (process.env.DATABASE_PROVIDER ?? '').toLowerCase();
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (provider !== 'mysql') {
	throw new Error('MySQL QA 必须显式设置 DATABASE_PROVIDER=mysql');
}

if (!testDatabaseUrl?.startsWith('mysql://')) {
	throw new Error('MySQL QA 必须设置 TEST_DATABASE_URL=mysql://...');
}

if (process.env.MYSQL_QA_ALLOW_RESET !== 'true') {
	throw new Error(
		'MySQL QA 会在隔离测试库上重置 schema；请仅对临时库设置 MYSQL_QA_ALLOW_RESET=true'
	);
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, '');
if (!databaseName) {
	throw new Error('TEST_DATABASE_URL 必须包含独立的数据库名');
}

const env = {
	...process.env,
	DATABASE_PROVIDER: 'mysql',
	DATABASE_URL: testDatabaseUrl,
	TEST_DATABASE_URL: testDatabaseUrl
};

function run(command, args) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.status !== 0) {
		throw result.error ?? new Error(command + ' ' + args.join(' ') + ' 执行失败');
	}
}

function prepareDatabase() {
	run('pnpm', ['exec', 'prisma', 'generate']);
	run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
}

function resetDatabase() {
	run('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed']);
}

console.log('MySQL QA 开始：数据库 ' + databaseName + '，迁移目录 prisma/migrations/mysql');

try {
	// 第一次 deploy 必须在全新的临时库上执行，以覆盖 0_init 到最新迁移。
	prepareDatabase();
	run('pnpm', ['run', 'test:admin-audit']);

	// 两个测试套件使用相同的固定测试标识；重建临时 schema 保证套件间隔离。
	resetDatabase();
	prepareDatabase();
	run('pnpm', ['run', 'test:blog-assets']);

	console.log('MySQL QA 通过：迁移、审计不可变触发器、媒体 reservation 回归均已执行。');
} catch (error) {
	console.error('MySQL QA 失败：', error);
	process.exitCode = 1;
}
