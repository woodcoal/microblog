import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [assets, editor, writePage, editPage, articleList, detailBody] = await Promise.all([
	readFile(new URL('../src/components/BlogAssets.tsx', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/BlogEditor.tsx', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/blog/write.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/pages/[username]/[postId]/edit.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/BlogArticleList.astro', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/post-detail/PostDetailBody.astro', import.meta.url), 'utf8')
]);

test('博客资源面板限制客户端选择，并通过 reservation action 管理放弃的上传', () => {
	assert.match(assets, /const MAX_ATTACHMENTS = 10/);
	assert.match(assets, /MAX_ATTACHMENT_SIZE = 20 \* 1024 \* 1024/);
	assert.match(assets, /MAX_TOTAL_ATTACHMENT_SIZE = 100 \* 1024 \* 1024/);
	assert.match(assets, /actions\.uploadMedia/);
	assert.match(assets, /actions\.cancelUpload/);
	assert.match(assets, /attachmentFileStorageIds/);
	assert.match(assets, /aria-label={`将 \$\{asset\.originalName\} 上移`}/);
	assert.doesNotMatch(assets, /innerHTML/);
});

test('新建和编辑博客将缩略图、附件与正文一起传入文章 action', () => {
	assert.match(editor, /BlogAssets/);
	assert.match(editor, /assetsContainerId/);
	assert.match(editor, /BlogEditorSubmitData/);
	for (const page of [writePage, editPage]) {
		assert.match(page, /thumbnailFileStorageId/);
		assert.match(page, /attachmentFileStorageIds/);
		assert.match(page, /blog-(compose|edit)-assets/);
		assert.match(page, /assetsContainerId/);
	}
	assert.match(editPage, /initialBlogThumbnail/);
	assert.match(editPage, /initialBlogAttachments/);
});

test('博客读者界面使用受控缩略图和下载地址，并分隔正文媒体与附件', () => {
	assert.match(articleList, /src=\{`\/media\/\$\{thumbnail\.id\}`\}/);
	assert.match(detailBody, /src=\{`\/media\/\$\{thumbnail\.id\}`\}/);
	assert.match(detailBody, /post-detail-blog-thumbnail/);
	assert.match(detailBody, /正文媒体/);
	assert.match(detailBody, /附件/);
	assert.match(detailBody, /href=\{`\/media\/\$\{media\.id\}\/download`\}/);
	assert.doesNotMatch(detailBody, /media\.fileStorage\.filePath\.split/);
});
