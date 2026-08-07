import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	calculateTrendingScore,
	DEFAULT_TRENDING_CONFIG,
	parseTrendingConfig,
	stableTrendingSort
} from '../src/lib/trending';

test('invalid environment configuration falls back to a safe 48-hour half-life', () => {
	assert.deepEqual(parseTrendingConfig('{bad json'), DEFAULT_TRENDING_CONFIG);
	assert.equal(parseTrendingConfig('{"decayHours":0}').decayHours, 48);
});

test('score halves after one default half-life and ties have deterministic order', () => {
	const now = Date.UTC(2026, 0, 1);
	const fresh = calculateTrendingScore({ likes: 4, bookmarks: 0, comments: 0 }, new Date(now), undefined, now);
	const old = calculateTrendingScore({ likes: 4, bookmarks: 0, comments: 0 }, new Date(now - 48 * 3_600_000), undefined, now);
	assert.equal(old, fresh / 2);
	assert.deepEqual(
		stableTrendingSort([
			{ id: 'b', createdAt: new Date(now), score: 1 },
			{ id: 'a', createdAt: new Date(now), score: 1 }
		]).map((item) => item.id),
		['a', 'b']
	);
});
