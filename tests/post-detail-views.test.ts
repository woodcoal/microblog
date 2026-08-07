import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [route, model, body, weiboView, forumView, blogView] = await Promise.all([
	readFile(new URL('../src/pages/[username]/[postId]/index.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/lib/post-detail.ts', import.meta.url), 'utf8'),
	readFile(
		new URL('../src/components/post-detail/PostDetailBody.astro', import.meta.url),
		'utf8'
	),
	readFile(new URL('../src/views/post-detail/WeiboDetailView.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/views/post-detail/ForumDetailView.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/views/post-detail/BlogDetailView.astro', import.meta.url), 'utf8')
]);

test('公开详情路由仅加载模型并按 post.mode 分发内部 View', () => {
	assert.match(route, /loadPostDetail\(Astro\)/);
	assert.match(route, /model\.postMode === 'weibo'/);
	assert.match(route, /ForumDetailView/);
	assert.match(route, /BlogDetailView/);
	assert.doesNotMatch(route, /UserLayout/);
	assert.match(model, /POST_DETAIL_MODES = \['weibo', 'forum', 'blog'\]/);
	assert.match(model, /UnknownPostDetailModeError/);
});

test('三种详情 View 复用频道 Layout 与共享详情展示块', () => {
	assert.match(weiboView, /<WeiboLayout/);
	assert.match(forumView, /<ForumLayout/);
	assert.match(blogView, /<BlogLayout/);
	for (const view of [weiboView, forumView, blogView]) {
		assert.match(view, /<PostDetailBody model=\{model\} \/>/);
		assert.match(view, /<PostDetailAside model=\{model\} \/>/);
		assert.match(view, /jsonLd=/);
	}
	assert.match(body, /<CommentList/);
	assert.match(body, /WeiboMediaGallery/);
});
