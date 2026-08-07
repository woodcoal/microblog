import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	allocateBlendedRecommendations,
	allocateColdStartRecommendations,
	type TrendingFeedItem
} from '../src/services/recommend.service';

function recommendationCandidate(index: number, options: { author?: string; categoryId?: string | null; tagIds?: string[] } = {}): TrendingFeedItem {
	const id = `candidate_${index}`;
	return {
		id,
		userId: options.author ?? `author_${index}`,
		content: id,
		createdAt: new Date(1_000_000 - index),
		updatedAt: new Date(1_000_000 - index),
		visibility: 'public', passwordHash: null, allowedUserIds: null,
		isPinned: false, isGlobalPinned: false, isLocked: false, isEdited: false,
		mode: 'weibo', title: null, categoryId: options.categoryId ?? null, customCategory: null,
		user: { id: options.author ?? `author_${index}`, username: `user_${index}`, displayName: `User ${index}`, avatarUrl: '' },
		media: [],
		tags: (options.tagIds ?? []).map((tagId) => ({ tag: { id: tagId, name: tagId } })),
		category: null,
		_count: { likes: 0, comments: 0, bookmarks: 0 },
		liked: false, bookmarked: false, score: 100 - index, uniqueInteractorCount: 0
	};
}

function assertNoThreeConsecutiveValues(values: Array<string | null>) {
	for (let index = 2; index < values.length; index++) {
		assert.notEqual(values[index] && values[index] === values[index - 1] && values[index] === values[index - 2], true);
	}
}

test('cold start keeps 14/6 source quotas and interleaves them deterministically', () => {
	const candidates = Array.from({ length: 20 }, (_, index) => recommendationCandidate(index));
	const first = allocateColdStartRecommendations(candidates, 20);
	const second = allocateColdStartRecommendations(candidates, 20);
	assert.deepEqual(first, second);
	assert.deepEqual(first.reduce((counts, item) => ({ ...counts, [item.source]: counts[item.source] + 1 }), { interest: 0, trending: 0, exploration: 0 }), { interest: 0, trending: 14, exploration: 6 });
	assertNoThreeConsecutiveValues(first.map((item) => item.source));
});

test('blended recommendations interleave quotas and enforce author, category, and every-tag streak limits', () => {
	const candidates = Array.from({ length: 30 }, (_, index) => recommendationCandidate(index, {
		author: `author_${index % 10}`,
		categoryId: `category_${index % 3}`,
		tagIds: [`tag_${index % 4}`, `secondary_${index % 5}`]
	}));
	for (const index of [0, 3, 6, 9, 12, 15, 18, 21, 24, 27]) candidates[index] = recommendationCandidate(index, {
		author: `author_${index % 10}`, categoryId: `category_${index % 3}`, tagIds: ['interest', `secondary_${index % 5}`]
	});
	const items = allocateBlendedRecommendations(candidates, { interestTagIds: ['interest'], interestCategoryIds: [] }, 10);
	assert.deepEqual(items.reduce((counts, item) => ({ ...counts, [item.source]: counts[item.source] + 1 }), { interest: 0, trending: 0, exploration: 0 }), { interest: 5, trending: 4, exploration: 1 });
	assertNoThreeConsecutiveValues(items.map((item) => item.source));
	for (const count of Object.values(items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.post.userId]: (counts[item.post.userId] ?? 0) + 1 }), {}))) assert.ok(count <= 2);
	assertNoThreeConsecutiveValues(items.map((item) => item.post.categoryId));
	for (const tagId of new Set(items.flatMap((item) => item.post.tags.map(({ tag }) => tag.id)))) {
		assertNoThreeConsecutiveValues(items.map((item) => item.post.tags.some(({ tag }) => tag.id === tagId) ? tagId : null));
	}
});
