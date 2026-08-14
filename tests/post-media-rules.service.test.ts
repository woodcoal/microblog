import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/lib/db';
import { createPost, updatePost } from '../src/services/content.service';

let sequence = 0;

async function createUser() {
	const suffix = `media_rules_${sequence++}`;
	return prisma.user.create({
		data: {
			username: suffix,
			displayName: suffix,
			email: `${suffix}@example.test`,
			passwordHash: 'hash'
		}
	});
}

async function reserve(userId: string, types: Array<'image' | 'video'>) {
	return Promise.all(
		types.map(async (fileType) => {
			const suffix = `${sequence++}`;
			const file = await prisma.fileStorage.create({
				data: {
					md5Hash: `media-rule-${suffix}`,
					filePath: `protected/${fileType}s/${suffix}`,
					fileSize: 1,
					mimeType: fileType === 'image' ? 'image/png' : 'video/mp4',
					fileType,
					refCount: 1
				}
			});
			await prisma.uploadReservation.create({
				data: {
					userId,
					fileStorageId: file.id,
					originalName: `${suffix}.${fileType === 'image' ? 'png' : 'mp4'}`,
					fileType,
					expiresAt: new Date(Date.now() + 60_000)
				}
			});
			return file.id;
		})
	);
}

after(async () => prisma.$disconnect());

test('创建微博只允许 0–9 图或一个视频', async () => {
	const user = await createUser();
	const empty = await createPost({
		userId: user.id,
		mode: 'weibo',
		content: 'empty',
		mediaIds: []
	});
	assert.equal(await prisma.media.count({ where: { postId: empty.id } }), 0);

	const nine = await reserve(
		user.id,
		Array.from({ length: 9 }, () => 'image' as const)
	);
	const imagePost = await createPost({
		userId: user.id,
		mode: 'weibo',
		content: 'nine',
		mediaIds: nine
	});
	assert.equal(await prisma.media.count({ where: { postId: imagePost.id } }), 9);

	const ten = await reserve(
		user.id,
		Array.from({ length: 10 }, () => 'image' as const)
	);
	await assert.rejects(
		createPost({ userId: user.id, mode: 'weibo', content: 'ten', mediaIds: ten }),
		/图片最多 9 张/
	);

	const video = await reserve(user.id, ['video']);
	const videoPost = await createPost({
		userId: user.id,
		mode: 'weibo',
		content: 'video',
		mediaIds: video
	});
	assert.equal(
		(await prisma.media.findFirstOrThrow({ where: { postId: videoPost.id } })).fileType,
		'video'
	);

	const twoVideos = await reserve(user.id, ['video', 'video']);
	await assert.rejects(
		createPost({ userId: user.id, mode: 'weibo', content: 'two videos', mediaIds: twoVideos }),
		/0–9 张图片或一个视频/
	);
	const mixed = await reserve(user.id, ['image', 'video']);
	await assert.rejects(
		createPost({ userId: user.id, mode: 'weibo', content: 'mixed', mediaIds: mixed }),
		/0–9 张图片或一个视频/
	);
});

test('编辑微博同样限制 0–9 图或一个视频', async () => {
	const user = await createUser();
	const post = await createPost({
		userId: user.id,
		mode: 'weibo',
		content: 'before',
		mediaIds: []
	});
	const nine = await reserve(
		user.id,
		Array.from({ length: 9 }, () => 'image' as const)
	);
	await updatePost({ userId: user.id, postId: post.id, content: 'nine', mediaIds: nine });
	assert.equal(await prisma.media.count({ where: { postId: post.id } }), 9);

	const ten = await reserve(
		user.id,
		Array.from({ length: 10 }, () => 'image' as const)
	);
	await assert.rejects(
		updatePost({ userId: user.id, postId: post.id, content: 'ten', mediaIds: ten }),
		/图片最多 9 张/
	);

	const video = await reserve(user.id, ['video']);
	await updatePost({ userId: user.id, postId: post.id, content: 'video', mediaIds: video });
	assert.equal(
		(await prisma.media.findFirstOrThrow({ where: { postId: post.id } })).fileType,
		'video'
	);

	const twoVideos = await reserve(user.id, ['video', 'video']);
	await assert.rejects(
		updatePost({
			userId: user.id,
			postId: post.id,
			content: 'two videos',
			mediaIds: twoVideos
		}),
		/0–9 张图片或一个视频/
	);
	const mixed = await reserve(user.id, ['image', 'video']);
	await assert.rejects(
		updatePost({ userId: user.id, postId: post.id, content: 'mixed', mediaIds: mixed }),
		/0–9 张图片或一个视频/
	);
	await updatePost({ userId: user.id, postId: post.id, content: 'empty', mediaIds: [] });
	assert.equal(await prisma.media.count({ where: { postId: post.id } }), 0);
});
