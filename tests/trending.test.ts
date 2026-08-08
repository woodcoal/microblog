import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	calculateTrendingScore,
	DEFAULT_TRENDING_CONFIG,
	parseTrendingConfig,
	stableTrendingSort
} from '../src/lib/trending';

test('v2 config validates atomically and migrates the real three-field legacy object', () => {
	assert.deepEqual(parseTrendingConfig('{bad json'), DEFAULT_TRENDING_CONFIG);
	assert.equal(parseTrendingConfig('{"decayHours":0}').decayHours, 48);
	assert.deepEqual(parseTrendingConfig('{"wLikes":4,"wComments":3,"decayHours":24}'), {
		version: 'v2',
		wLikes: 4,
		wBookmarks: 2,
		wComments: 3,
		decayHours: 24 * Math.LN2
	});
	assert.deepEqual(
		parseTrendingConfig('{"wLikes":4,"wBookmarks":2,"wComments":3,"decayHours":24}'),
		{ version: 'v2', wLikes: 4, wBookmarks: 2, wComments: 3, decayHours: 24 }
	);
	assert.deepEqual(
		parseTrendingConfig(
			'{"version":"v2","wLikes":4,"wBookmarks":2,"wComments":3,"decayHours":720}'
		),
		{ version: 'v2', wLikes: 4, wBookmarks: 2, wComments: 3, decayHours: 720 }
	);
	assert.deepEqual(
		parseTrendingConfig(
			'{"version":"v2","wLikes":4,"wBookmarks":2,"wComments":3,"decayHours":721}'
		),
		DEFAULT_TRENDING_CONFIG
	);
	assert.deepEqual(
		parseTrendingConfig(
			'{"version":"v2","wLikes":0,"wBookmarks":0,"wComments":0,"decayHours":48}'
		),
		DEFAULT_TRENDING_CONFIG
	);
	assert.deepEqual(
		parseTrendingConfig('{"wLikes":0,"wComments":0,"decayHours":24}'),
		DEFAULT_TRENDING_CONFIG
	);
});

test('migrated legacy decay curve, v2 half-life, and ties have deterministic order', () => {
	const now = Date.UTC(2026, 0, 1);
	const fresh = calculateTrendingScore(
		{ likes: 4, bookmarks: 0, comments: 0 },
		new Date(now),
		undefined,
		now
	);
	const old = calculateTrendingScore(
		{ likes: 4, bookmarks: 0, comments: 0 },
		new Date(now - 48 * 3_600_000),
		undefined,
		now
	);
	assert.equal(old, fresh / 2);
	const legacy = parseTrendingConfig('{"wLikes":1,"wComments":2,"decayHours":24}');
	const legacyFresh = calculateTrendingScore(
		{ likes: 4, bookmarks: 0, comments: 1 },
		new Date(now),
		legacy,
		now
	);
	const elapsedHours = 17;
	const migratedScore = calculateTrendingScore(
		{ likes: 4, bookmarks: 0, comments: 1 },
		new Date(now - elapsedHours * 3_600_000),
		legacy,
		now
	);
	assert.ok(Math.abs(migratedScore - legacyFresh * Math.exp(-elapsedHours / 24)) < 1e-12);
	assert.equal(
		calculateTrendingScore(
			{ likes: 1, bookmarks: 1, comments: 1 },
			new Date(now),
			undefined,
			now
		),
		Math.log(2) * 6
	);
	assert.deepEqual(
		stableTrendingSort([
			{ id: 'b', createdAt: new Date(now), score: 1 },
			{ id: 'a', createdAt: new Date(now), score: 1 }
		]).map((item) => item.id),
		['a', 'b']
	);
});
