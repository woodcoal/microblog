import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const page = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const recommendService = await readFile(
	new URL('../src/services/recommend.service.ts', import.meta.url),
	'utf8'
);

test('首页推荐区保留冷启动、独立状态和无障碍关注时序契约', () => {
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
	assert.match(page, /recommend-preview-stat-bookmark\.is-active/);
	assert.match(page, /recommend-preview-stat-bookmark\.is-active svg/);
	assert.match(page, /count > 0 \? \['is-active'\] : \[\]/);
	assert.doesNotMatch(page, /home-preview-mark/);
	assert.doesNotMatch(page, /recommend-table-wrap/);
	assert.match(page, /style is:global/);
	assert.match(page, /actions\.toggleFollow/);
	assert.match(page, /已关注 \$\{item\.displayName\}/);
	assert.match(page, /recommend-user-card\.is-removing/);
	assert.match(page, /animation: recommend-user-card-leave 180ms ease-out forwards/);
	assert.match(page, /card\.classList\.add\('is-removing'\)/);
	assert.match(page, /card\.addEventListener\('animationend', finishRemoval, \{ once: true \}\)/);
	assert.match(
		page,
		/if \(followButton\.disabled \|\| card\.classList\.contains\('is-removing'\)\) return;/
	);
	assert.match(page, /if \(card\.isConnected && !card\.classList\.contains\('is-removing'\)\)/);
	assert.match(page, /card\.nextElementSibling\?\.querySelector<HTMLElement>\(/);
	assert.match(page, /nextFocusTarget\.focus\(\)/);
	assert.match(page, /showUsersEmptyState\(\)\.focus\(\)/);
	assert.match(page, /<h3 id="recommend-users-title" tabindex="-1">推荐创作者<\/h3>/);
	assert.match(page, /focusUsersHeading\(\)/);
	assert.match(
		page,
		/id="recommend-users-feedback"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/
	);
	assert.match(page, /min-height: 44px/);
});
