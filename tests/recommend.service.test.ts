import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { prisma } from '../src/lib/db';
import { getRecommend, getRecommendationProfile, getTrendingFeed, saveInterests } from '../src/services/recommend.service';

async function user(username: string) {
	return prisma.user.create({ data: { username, displayName: username, email: `${username}@test`, passwordHash: 'hash' } });
}

beforeEach(async () => {
	await prisma.like.deleteMany(); await prisma.bookmark.deleteMany(); await prisma.comment.deleteMany();
	await prisma.follow.deleteMany(); await prisma.post.deleteMany(); await prisma.userTagInterest.deleteMany();
	await prisma.userCategoryInterest.deleteMany(); await prisma.userSettings.deleteMany(); await prisma.user.deleteMany();
});
after(async () => prisma.$disconnect());

test('200-window paging excludes self interaction and pins only when explicitly requested', async () => {
	const author = await user('author'); const visitor = await user('visitor');
	const now = Date.now();
	await prisma.post.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ id: `p${index}`, userId: author.id, content: `post ${index}`, createdAt: new Date(now - index * 1000), updatedAt: new Date(now - index * 1000) })) });
	await prisma.like.createMany({ data: [{ userId: visitor.id, postId: 'p1' }, { userId: author.id, postId: 'p0' }] });
	const feed = await getTrendingFeed({ viewerId: visitor.id, page: 1, pageSize: 200 });
	assert.equal(feed.total, 200);
	assert.equal(feed.items[0].id, 'p1');
	assert.equal(feed.items.some((post) => post.id === 'p200'), false);
	assert.deepEqual((await getTrendingFeed({ viewerId: visitor.id, page: 3, pageSize: 100 })).items, []);
	await prisma.post.update({ where: { id: 'p0' }, data: { isGlobalPinned: true } });
	assert.equal((await getTrendingFeed({ viewerId: visitor.id, page: 1, pageSize: 20 })).items.some((post) => post.id === 'p0'), false);
	assert.equal((await getTrendingFeed({ viewerId: visitor.id, page: 1, pageSize: 20, includeGlobalPinned: true })).items[0].id, 'p0');
});

test('skip persists only completion state and five positive signals switch to blended', async () => {
	const viewer = await user('viewer'); const targets = await Promise.all(Array.from({ length: 5 }, (_, index) => user(`target${index}`)));
	await saveInterests({ userId: viewer.id, tagIds: [], categoryIds: [], skip: true });
	let profile = await getRecommendationProfile(viewer.id);
	assert.ok(profile.onboardingCompletedAt); assert.equal(profile.interestTagIds.length, 0); assert.equal(profile.strategy, 'cold_start');
	await prisma.follow.createMany({ data: targets.map((target) => ({ followerId: viewer.id, followingId: target.id })) });
	profile = await getRecommendationProfile(viewer.id);
	assert.equal(profile.positiveSignalCount, 5); assert.equal(profile.strategy, 'blended'); assert.deepEqual(profile.weights, { interest: 0.5, trending: 0.4, exploration: 0.1 });
});

test('blended output deterministically reserves 50/40/10 interest, trending, and exploration slots', async () => {
	const viewer = await user('blend_viewer'); const author = await user('blend_author');
	const targets = await Promise.all(Array.from({ length: 5 }, (_, index) => user(`blend_target${index}`)));
	const tag = await prisma.tag.create({ data: { name: 'interest-tag' } });
	const now = Date.now();
	await prisma.post.createMany({ data: Array.from({ length: 12 }, (_, index) => ({ id: `blend_${index}`, userId: author.id, content: `blend ${index}`, createdAt: new Date(now - index * 1000), updatedAt: new Date(now - index * 1000) })) });
	await prisma.postTag.createMany({ data: Array.from({ length: 5 }, (_, index) => ({ postId: `blend_${index}`, tagId: tag.id })) });
	await prisma.follow.createMany({ data: targets.map((target) => ({ followerId: viewer.id, followingId: target.id })) });
	await saveInterests({ userId: viewer.id, tagIds: [tag.id], categoryIds: [] });
	const first = await getRecommend({ userId: viewer.id, n: 10 });
	const second = await getRecommend({ userId: viewer.id, n: 10 });
	assert.equal(first.profile?.strategy, 'blended');
	assert.deepEqual(first.items.map((item) => item.id), second.items.map((item) => item.id));
	assert.deepEqual(first.items.reduce((counts, item) => ({ ...counts, [item.source!]: counts[item.source!] + 1 }), { interest: 0, trending: 0, exploration: 0 }), { interest: 5, trending: 4, exploration: 1 });
	assert.equal(first.items.find((item) => item.source === 'exploration')?.tags.some((item) => item.id === tag.id), false);
});
