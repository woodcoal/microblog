import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const page = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const recommendService = await readFile(
	new URL('../src/services/recommend.service.ts', import.meta.url),
	'utf8'
);

test('首页推荐区保留冷启动、独立状态和无障碍交互契约', () => {
	assert.match(page, /getRecommendationProfile/);
	assert.match(page, /home-preview-chrome/);
	assert.match(page, /includeGlobalPinned: true/);
	assert.match(page, /recommend-all-link/);
	assert.match(page, /data-interest-kind/);
	assert.match(page, /aria-pressed="false"/);
	assert.match(page, /actions\.saveInterests/);
	assert.match(page, /recommend-post-skeleton/);
	assert.match(page, /recommend-user-skeleton/);
	assert.match(page, /aria-busy/);
	assert.match(page, /role="status"/);
	assert.doesNotMatch(page, /id="home-feed"/);
	assert.match(page, /recommend-preview-list/);
	assert.match(page, /#recommend-posts-list \.home-preview-item/);
	assert.match(page, /home-preview-avatar-link/);
	assert.match(page, /aria-label={`查看 \$\{post\.user\.displayName\} 的主页`}/);
	assert.match(page, /avatarLink\.href = profileUrl/);
	assert.match(page, /avatar\.alt = ''/);
	assert.match(recommendService, /bookmarkCount: post\._count\.bookmarks/);
	assert.match(page, /recommend-preview-stats/);
	assert.match(page, /createInteractionStat\('bookmark', bookmarkCount\)/);
	assert.match(page, /safeCount\(item\.bookmarkCount\)/);
	assert.match(page, /点赞 \$\{likeCount\}，收藏 \$\{bookmarkCount\}，评论 \$\{commentCount\}/);
	assert.doesNotMatch(page, /home-preview-mark/);
	assert.doesNotMatch(page, /recommend-table-wrap/);
	assert.match(page, /style is:global/);
	assert.match(page, /actions\.toggleFollow/);
	assert.match(page, /已关注 \$\{item\.displayName\}/);
	assert.match(page, /min-height: 44px/);
});
