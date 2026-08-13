/* global console, process, URL */

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import mariadb from 'mariadb';

const provider = (process.env.DATABASE_PROVIDER ?? '').toLowerCase();
const adminUrlText =
	process.env.MYSQL_QA_ADMIN_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();

if (provider !== 'mysql') {
	throw new Error('MySQL QA 必须显式设置 DATABASE_PROVIDER=mysql');
}

if (!adminUrlText?.startsWith('mysql://')) {
	throw new Error(
		'MySQL QA 必须设置 MYSQL_QA_ADMIN_URL 或 TEST_DATABASE_URL=mysql://...；该连接只用于创建和删除临时库'
	);
}

const adminUrl = new URL(adminUrlText);
const configuredDatabase = adminUrl.pathname.replace(/^\//, '');
const databasePrefix = process.env.MYSQL_QA_DATABASE_PREFIX?.trim() || 'mutan_qa';
const useExistingDatabase = process.env.MYSQL_QA_EXISTING_DATABASE === 'true';
const existingDatabaseName = process.env.MYSQL_QA_EXISTING_DATABASE_NAME?.trim() || 'dev';

if (!/^[a-z][a-z0-9_]{0,20}$/.test(databasePrefix)) {
	throw new Error('MYSQL_QA_DATABASE_PREFIX 只能包含小写字母、数字和下划线，且以字母开头');
}

if (adminUrl.searchParams.has('database')) {
	throw new Error('MYSQL_QA_ADMIN_URL 不得通过 query string 指定数据库');
}

if (useExistingDatabase) {
	if (existingDatabaseName !== 'dev' || configuredDatabase !== existingDatabaseName) {
		throw new Error(
			'既有 MySQL QA 库模式只允许明确指定 MYSQL_QA_EXISTING_DATABASE_NAME=dev，且连接 URL 必须指向 dev'
		);
	}
} else if (configuredDatabase && configuredDatabase === 'dev') {
	console.warn(
		'MySQL QA 未启用既有库模式；连接 URL 中的 dev 只用于获取管理连接，测试仍会创建随机临时库'
	);
}

const databaseName = useExistingDatabase
	? existingDatabaseName
	: `${databasePrefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
const connectionOptions = {
	host: adminUrl.hostname,
	port: Number(adminUrl.port || 3306),
	user: decodeURIComponent(adminUrl.username),
	password: decodeURIComponent(adminUrl.password),
	connectTimeout: 10_000,
	...(useExistingDatabase ? { database: existingDatabaseName } : {})
};

if (!connectionOptions.user) {
	throw new Error('MYSQL_QA_ADMIN_URL 必须包含数据库用户');
}

function quoteIdentifier(identifier) {
	return `\`${identifier.replaceAll('`', '``')}\``;
}

function redactedError(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replaceAll(adminUrlText, 'mysql://<redacted>');
}

function run(command, args, env) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} 执行失败（退出码 ${result.status ?? 'unknown'}）`
		);
	}
}

let adminConnection;
let databaseCreated = false;
let existingDatabaseConfirmed = false;
let failure;

async function confirmExistingDatabase(connection) {
	const selected = await connection.query('SELECT DATABASE() AS databaseName');
	if (selected[0]?.databaseName !== existingDatabaseName) {
		throw new Error(`既有 QA 库确认失败：当前连接库不是 ${existingDatabaseName}`);
	}
	const schemas = await connection.query(
		'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
		[existingDatabaseName]
	);
	if (schemas.length !== 1) {
		throw new Error(`既有 QA 库确认失败：数据库 ${existingDatabaseName} 不存在`);
	}
}

async function cleanExistingDatabase(connection) {
	const tables = await connection.query(
		"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
		[existingDatabaseName]
	);
	let cleanupFailure;
	try {
		await connection.query('SET FOREIGN_KEY_CHECKS=0');
		for (const table of tables) {
			await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(table.TABLE_NAME)}`);
		}
	} catch (error) {
		cleanupFailure = error;
	} finally {
		try {
			await connection.query('SET FOREIGN_KEY_CHECKS=1');
		} catch (error) {
			cleanupFailure ??= error;
		}
	}
	if (cleanupFailure) throw cleanupFailure;

	const remaining = await connection.query(
		"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
		[existingDatabaseName]
	);
	if (remaining.length !== 0) {
		throw new Error(
			`既有 QA 库清理失败：仍有表 ${remaining.map((table) => table.TABLE_NAME).join(', ')}`
		);
	}
	console.log(`MySQL QA 清理通过：既有 QA 库 ${existingDatabaseName} 的全部业务表已删除。`);
}

try {
	adminConnection = await mariadb.createConnection(connectionOptions);
	if (useExistingDatabase) {
		await confirmExistingDatabase(adminConnection);
		existingDatabaseConfirmed = true;
	} else {
		await adminConnection.query(
			`CREATE DATABASE ${quoteIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
		);
		databaseCreated = true;
	}

	const databaseUrl = new URL(adminUrlText);
	databaseUrl.pathname = `/${databaseName}`;
	const env = {
		...process.env,
		DATABASE_PROVIDER: 'mysql',
		DATABASE_URL: databaseUrl.toString(),
		TEST_DATABASE_URL: databaseUrl.toString(),
		MAIL_DELIVERY_MODE: 'disabled'
	};

	console.log(
		`MySQL QA 开始：${useExistingDatabase ? `既有 QA 库 ${databaseName}` : `临时库 ${databaseName}`}，来源库 ${configuredDatabase || '未指定'}`
	);
	console.log(
		`MySQL QA 覆盖：${useExistingDatabase ? '既有库迁移' : '空库迁移'}、20 路并发首注册、管理员唯一性和清理。`
	);

	run('pnpm', ['exec', 'prisma', 'generate'], env);
	run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], env);
	run('pnpm', ['exec', 'tsx', '--test', 'tests/mysql-qa.acceptance.test.ts'], env);
} catch (error) {
	failure = error;
} finally {
	if (existingDatabaseConfirmed && adminConnection) {
		try {
			await cleanExistingDatabase(adminConnection);
		} catch (error) {
			failure ??= new Error(`既有 QA 库清理失败：${redactedError(error)}`);
		}
	}
	if (databaseCreated && adminConnection) {
		try {
			await adminConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
			const remaining = await adminConnection.query(
				'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
				[databaseName]
			);
			if (remaining.length !== 0) {
				failure ??= new Error('临时库删除后仍可见');
			}
			console.log(`MySQL QA 清理通过：临时库 ${databaseName} 已删除。`);
		} catch (error) {
			failure ??= new Error(`临时库清理失败：${redactedError(error)}`);
		}
	}
	if (adminConnection) await adminConnection.end().catch(() => {});
}

if (failure) {
	console.error(`MySQL QA 失败：${redactedError(failure)}`);
	process.exitCode = 1;
} else {
	console.log(
		`MySQL QA 通过：迁移、20 路首注册和${useExistingDatabase ? '既有 QA 库表清理' : '临时库清理'}均已执行。`
	);
}
