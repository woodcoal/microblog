/** Pure trending configuration, scoring, and deterministic ordering helpers. */

export interface TrendingConfig {
	wLikes: number;
	wBookmarks: number;
	wComments: number;
	decayHours: number;
}

export const DEFAULT_TRENDING_CONFIG: TrendingConfig = {
	wLikes: 1,
	wBookmarks: 1,
	wComments: 2,
	decayHours: 48
};

/** Invalid JSON, non-finite weights, and non-positive half-lives safely use defaults. */
export function parseTrendingConfig(raw?: string): TrendingConfig {
	if (!raw) return { ...DEFAULT_TRENDING_CONFIG };
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== 'object') return { ...DEFAULT_TRENDING_CONFIG };
		const config = value as Partial<TrendingConfig>;
		const numberOr = (candidate: unknown, fallback: number) =>
			typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
		const decayHours = numberOr(config.decayHours, DEFAULT_TRENDING_CONFIG.decayHours);
		return {
			wLikes: numberOr(config.wLikes, DEFAULT_TRENDING_CONFIG.wLikes),
			wBookmarks: numberOr(config.wBookmarks, DEFAULT_TRENDING_CONFIG.wBookmarks),
			wComments: numberOr(config.wComments, DEFAULT_TRENDING_CONFIG.wComments),
			decayHours: decayHours > 0 ? decayHours : DEFAULT_TRENDING_CONFIG.decayHours
		};
	} catch {
		return { ...DEFAULT_TRENDING_CONFIG };
	}
}

export interface TrendingSignals {
	likes: number;
	bookmarks: number;
	comments: number;
}

/** Applies a 48-hour half-life by default: score halves every decayHours. */
export function calculateTrendingScore(
	signals: TrendingSignals,
	createdAt: Date,
	config: TrendingConfig = DEFAULT_TRENDING_CONFIG,
	now = Date.now()
): number {
	const ageHours = Math.max(0, (now - createdAt.getTime()) / 3_600_000);
	const engagement =
		signals.likes * config.wLikes +
		signals.bookmarks * config.wBookmarks +
		signals.comments * config.wComments;
	return engagement * Math.pow(0.5, ageHours / config.decayHours);
}

export interface ScoredTrendingItem {
	id: string;
	createdAt: Date;
	score: number;
}

/** Score descending, then newer content, then id ascending — independent of engine sort stability. */
export function stableTrendingSort<T extends ScoredTrendingItem>(items: readonly T[]): T[] {
	return [...items].sort(
		(a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)
	);
}
