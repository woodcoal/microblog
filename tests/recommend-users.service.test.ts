/** 推荐用户查询的契约测试：真实 Prisma/SQLite，覆盖排序、排除和输入边界。 */
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { explainRecommendUserCandidates } from '../src/lib/recommend';
import {
	getRecommendUsersActionHandler,
	RecommendUsersUnauthorizedError
} from '../src/actions/recommend-users.handler';
import { getRecommendUsers } from '../src/services/recommend.service';

const now = Date.now();
const recent = (daysAgo: number) => new Date(now - daysAgo * 24 * 60 * 60 * 1000);
const old = recent(91);

async function createUser(username: string, isDisabled = false) {
	return prisma.user.create({
		data: {
			username,
			displayName: `${username} display`,
			email: `${username}@example.test`,
			passwordHash: 'hash',
			avatarUrl: `/${username}.png`,
			bio: `${username} bio`,
			isDisabled
		}
	});
}

async function createPost(userId: string, id: string, createdAt: Date, visibility = 'public') {
	return prisma.post.create({
		data: {
			id,
			userId,
			content: id,
			visibility,
			createdAt,
			updatedAt: createdAt
		}
	});
}

beforeEach(async () => {
	await prisma.postRead.deleteMany();
	await prisma.follow.deleteMany();
	await prisma.post.deleteMany();
	await prisma.user.deleteMany();
});

after(async () => {
	await prisma.$disconnect();
});

test('按共同关注、公开发帖数、粉丝数、最新公开帖和用户名稳定推荐，并不暴露私有字段', async () => {
	const current = await createUser('viewer');
	const sharedOne = await createUser('shared_one');
	const sharedTwo = await createUser('shared_two');
	const mutualFirst = await createUser('mutual_first');
	const postSecond = await createUser('post_second');
	const followerThird = await createUser('follower_third');
	const recentFourth = await createUser('recent_fourth');
	const alpha = await createUser('alpha');
	const beta = await createUser('beta');
	const followerOne = await createUser('follower_one');
	const followerTwo = await createUser('follower_two');

	await prisma.follow.createMany({
		data: [
			{ followerId: current.id, followingId: sharedOne.id },
			{ followerId: current.id, followingId: sharedTwo.id },
			{ followerId: mutualFirst.id, followingId: sharedOne.id },
			{ followerId: mutualFirst.id, followingId: sharedTwo.id },
			{ followerId: postSecond.id, followingId: sharedOne.id },
			{ followerId: followerThird.id, followingId: sharedOne.id },
			{ followerId: recentFourth.id, followingId: sharedOne.id },
			{ followerId: alpha.id, followingId: sharedOne.id },
			{ followerId: beta.id, followingId: sharedOne.id },
			{ followerId: followerOne.id, followingId: followerThird.id },
			{ followerId: followerTwo.id, followingId: followerThird.id },
			{ followerId: followerTwo.id, followingId: recentFourth.id },
			{ followerId: followerOne.id, followingId: alpha.id },
			{ followerId: followerOne.id, followingId: beta.id }
		]
	});
	await createPost(mutualFirst.id, 'mutual_first_post', recent(4));
	await createPost(postSecond.id, 'post_second_one', recent(4));
	await createPost(postSecond.id, 'post_second_two', recent(4));
	await createPost(postSecond.id, 'post_second_three', recent(4));
	await createPost(followerThird.id, 'follower_third_one', recent(3));
	await createPost(followerThird.id, 'follower_third_two', recent(3));
	await createPost(recentFourth.id, 'recent_fourth_one', recent(1));
	await createPost(recentFourth.id, 'recent_fourth_two', recent(1));
	await createPost(alpha.id, 'alpha_one', recent(2));
	await createPost(alpha.id, 'alpha_two', recent(2));
	await createPost(beta.id, 'beta_one', recent(2));
	await createPost(beta.id, 'beta_two', recent(2));

	const result = await getRecommendUsers({ userId: current.id, n: 20 });
	assert.deepEqual(
		result.items.map((item) => item.username),
		['mutual_first', 'post_second', 'follower_third', 'recent_fourth', 'alpha', 'beta']
	);
	assert.deepEqual(Object.keys(result.items[0]).sort(), [
		'avatarUrl',
		'bio',
		'displayName',
		'followerCount',
		'id',
		'latestPublicPostAt',
		'mutualFollowCount',
		'username'
	]);
	assert.equal(result.items[0].mutualFollowCount, 2);
	assert.equal(result.items[2].followerCount, 2);
	assert.equal(result.items[3].latestPublicPostAt, recent(1).toISOString());
	assert.deepEqual(
		(await getRecommendUsers({ userId: current.id, n: 1 })).items.map((x) => x.username),
		['mutual_first']
	);
});

test('排除本人、已关注、禁用、非公开和过期候选；无候选返回空数组', async () => {
	const current = await createUser('viewer_two');
	const followed = await createUser('followed');
	const disabled = await createUser('disabled', true);
	const privateOnly = await createUser('private_only');
	const oldOnly = await createUser('old_only');
	const deletedOnly = await createUser('deleted_only');

	await prisma.follow.create({ data: { followerId: current.id, followingId: followed.id } });
	await createPost(current.id, 'self_post', recent(1));
	await createPost(followed.id, 'followed_post', recent(1));
	await createPost(disabled.id, 'disabled_post', recent(1));
	await createPost(privateOnly.id, 'private_post', recent(1), 'private');
	await createPost(oldOnly.id, 'old_post', old);
	await prisma.post.create({
		data: {
			id: 'deleted_post',
			userId: deletedOnly.id,
			content: 'deleted',
			isDeleted: true,
			createdAt: recent(1),
			updatedAt: recent(1)
		}
	});

	assert.deepEqual(await getRecommendUsers({ userId: current.id }), { items: [] });
});

test('数量边界为 1 到 20，服务对绕过 Action 的调用也防御性校验', async () => {
	const current = await createUser('viewer_three');
	assert.deepEqual(await getRecommendUsers({ userId: current.id, n: 20 }), { items: [] });
	await assert.rejects(getRecommendUsers({ userId: current.id, n: 0 }), /1 到 20/);
	await assert.rejects(getRecommendUsers({ userId: current.id, n: 21 }), /1 到 20/);
	await assert.rejects(getRecommendUsers({ userId: current.id, n: 1.5 }), /1 到 20/);
});

test('超过候选上限时，用户名尾部的最高分候选仍会被返回', async () => {
	const current = await createUser('candidate_viewer');
	const commonFollow = await createUser('common_follow');
	const highestScoringAtTail = await createUser('zzzz_highest_scoring');

	await prisma.follow.createMany({
		data: [
			{ followerId: current.id, followingId: commonFollow.id },
			{ followerId: highestScoringAtTail.id, followingId: commonFollow.id }
		]
	});

	const lowerScoringCandidates = await Promise.all(
		Array.from({ length: 200 }, (_, index) => createUser(`candidate_${String(index).padStart(3, '0')}`))
	);
	await prisma.post.createMany({
		data: [
			{
				id: 'tail_high_score_post',
				userId: highestScoringAtTail.id,
				content: 'highest score',
				createdAt: recent(1),
				updatedAt: recent(1)
			},
			...lowerScoringCandidates.map((candidate, index) => ({
				id: `candidate_cap_${index}`,
				userId: candidate.id,
				content: `candidate ${index}`,
				createdAt: recent(1),
				updatedAt: recent(1)
			}))
		]
	});

	assert.deepEqual(
		(await getRecommendUsers({ userId: current.id, n: 1 })).items.map((item) => item.username),
		['zzzz_highest_scoring']
	);
});

test('多关系规模下使用独立索引统计，不产生明细表行数乘法', async () => {
	const current = await createUser('performance_viewer');
	const candidate = await createUser('performance_candidate');
	const [sharedTargets, followers] = await Promise.all([
		Promise.all(Array.from({ length: 100 }, (_, index) => createUser(`shared_target_${index}`))),
		Promise.all(Array.from({ length: 100 }, (_, index) => createUser(`candidate_follower_${index}`)))
	]);

	await prisma.follow.createMany({
		data: [
			...sharedTargets.flatMap((sharedTarget) => [
				{ followerId: current.id, followingId: sharedTarget.id },
				{ followerId: candidate.id, followingId: sharedTarget.id }
			]),
			...followers.map((follower) => ({ followerId: follower.id, followingId: candidate.id }))
		]
	});
	await prisma.post.createMany({
		data: Array.from({ length: 100 }, (_, index) => ({
			id: `performance_post_${index}`,
			userId: candidate.id,
			content: `performance post ${index}`,
			createdAt: recent(1),
			updatedAt: recent(1)
		}))
	});

	const plan = await explainRecommendUserCandidates(current.id, recent(90), 200);
	const planDetails = plan.map((row) => row.detail);
	assert.ok(
		planDetails.filter((detail) => detail.includes('CORRELATED SCALAR SUBQUERY')).length >= 4,
		`应分别执行统计子查询，实际计划：${planDetails.join(' | ')}`
	);
	assert.equal(
		planDetails.some((detail) => detail.includes('USE TEMP B-TREE FOR count(DISTINCT)')),
		false,
		`不应通过 COUNT(DISTINCT) 消除并联行数，实际计划：${planDetails.join(' | ')}`
	);

	const startedAt = performance.now();
	const result = await getRecommendUsers({ userId: current.id, n: 1 });
	const elapsedMilliseconds = performance.now() - startedAt;
	assert.deepEqual(result.items.map((item) => item.username), ['performance_candidate']);
	assert.equal(result.items[0].mutualFollowCount, 100);
	assert.equal(result.items[0].followerCount, 100);
	assert.ok(
		elapsedMilliseconds < 1_000,
		`100×100×100 关系规模的候选查询耗时 ${elapsedMilliseconds.toFixed(1)}ms，疑似发生行数乘法`
	);
});

test('未登录调用 getRecommendUsers Action 返回 UNAUTHORIZED', async () => {
	const anonymousActionContext = {
		request: new Request('http://localhost/_actions/server.getRecommendUsers', { method: 'POST' }),
		cookies: { get: () => undefined }
	} as unknown as Parameters<typeof getRecommendUsersActionHandler>[1];

	await assert.rejects(
		getRecommendUsersActionHandler({}, anonymousActionContext),
		(error: unknown) => {
			assert.ok(error instanceof RecommendUsersUnauthorizedError);
			assert.equal(error.code, 'UNAUTHORIZED');
			return true;
		}
	);
});
