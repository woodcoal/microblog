import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationUrl = new URL(
	'../prisma/migrations/mysql/20260813152000_repair_admin_bootstrap/migration.sql',
	import.meta.url
);

test('MySQL 管理员 bootstrap 修复迁移通过实体化派生表读取 User', async () => {
	const sql = await readFile(migrationUrl, 'utf8');
	const [userUpdate] = sql.split('UPDATE `AdminBootstrap`');

	assert.match(
		userUpdate,
		/AND NOT EXISTS \(\s*--[^\n]*\n\s*SELECT 1 FROM \(\s*SELECT `id` FROM `User`\s*WHERE `role` = 'admin' AND `isDisabled` = false AND `deletedAt` IS NULL\s*LIMIT 1\s*\) AS `valid_admin`\s*\);/s
	);
	assert.doesNotMatch(userUpdate, /SELECT 1 FROM `User` AS `valid_admin`/);
});
