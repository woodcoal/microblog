import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const page = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');

test('首页推荐区保留冷启动、独立状态和无障碍交互契约', () => {
	assert.match(page, /getRecommendationProfile/);
	assert.match(page, /hero-trending-title/);
	assert.match(page, /recommend-all-link/);
	assert.match(page, /data-interest-kind/);
	assert.match(page, /aria-pressed="false"/);
	assert.match(page, /actions\.saveInterests/);
	assert.match(page, /recommend-post-skeleton/);
	assert.match(page, /recommend-user-skeleton/);
	assert.match(page, /aria-busy/);
	assert.match(page, /role="status"/);
	assert.match(page, /来自你已选的兴趣/);
	assert.match(page, /正在被讨论/);
	assert.match(page, /recommend-item-summary/);
	assert.match(page, /actions\.toggleFollow/);
	assert.match(page, /已关注 \$\{item\.displayName\}/);
	assert.match(page, /min-height: 44px/);
});
