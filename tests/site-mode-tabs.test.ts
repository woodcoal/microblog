import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [profilePage, searchPage, categoryManagementPage] = await Promise.all([
	readFile(new URL('../src/pages/[username]/index.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/search.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/admin/categories.astro', import.meta.url), 'utf8')
]);

test('个人主页仅渲染 SITE_MODES 已启用的内容标签，并回退无效频道参数', () => {
	assert.match(profilePage, /import \{[^}]*isModeEnabled[^}]*\} from '@\/lib\/config'/);
	assert.match(profilePage, /const enabledPostModes = validModes\.filter\(isModeEnabled\)/);
	assert.match(profilePage, /enabledPostModes\.includes\(requestedTab/);
	for (const mode of ['weibo', 'blog', 'forum']) {
		assert.match(profilePage, new RegExp(`isModeEnabled\\('${mode}'\\) && \\(`));
	}
});

test('搜索页仅提供已启用频道，且综合搜索排除已关闭频道', () => {
	assert.match(
		searchPage,
		/import \{ SITE_MODES, getModeLabel, isModeEnabled \} from '@\/lib\/config'/
	);
	assert.match(searchPage, /modeParam === 'all' \|\| isModeEnabled\(modeParam\)/);
	assert.match(searchPage, /mode: modeFilter === 'all' \? \{ in: SITE_MODES \} : modeFilter/);
	for (const mode of ['weibo', 'forum', 'blog']) {
		assert.match(searchPage, new RegExp(`isModeEnabled\\('${mode}'\\) && \\(`));
	}
});

test('后台分类管理仅提供已启用频道，并回退关闭频道的 URL 参数', () => {
	assert.match(
		categoryManagementPage,
		/import \{ getModeLabel, isModeEnabled \} from '@\/lib\/config'/
	);
	assert.match(categoryManagementPage, /const enabledCategoryModes = categoryModes\.filter\(isModeEnabled\)/);
	assert.match(categoryManagementPage, /enabledCategoryModes\.includes\(requestedMode/);
	assert.match(categoryManagementPage, /const categoryTabs = enabledCategoryModes\.map/);
});
