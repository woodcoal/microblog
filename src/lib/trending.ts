/** Pure MT-86 v2 trending configuration, scoring, and deterministic ordering. */
export interface TrendingConfig { version: 'v2'; wLikes: number; wBookmarks: number; wComments: number; decayHours: number; }
export const DEFAULT_TRENDING_CONFIG: TrendingConfig = { version: 'v2', wLikes: 1, wBookmarks: 2, wComments: 3, decayHours: 48 };
const valid = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const defaults = () => ({ ...DEFAULT_TRENDING_CONFIG });

/** Parses v2 atomically; the original three-field configuration is migrated without changing its decay curve. */
export function parseTrendingConfig(raw?: string): TrendingConfig {
	if (!raw) return defaults();
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults();
		const config = value as Record<string, unknown>;
		const { wLikes, wBookmarks, wComments, decayHours } = config;

		if (config.version === undefined && !('wBookmarks' in config)) {
			const halfLifeHours = typeof decayHours === 'number' ? decayHours * Math.LN2 : NaN;
			if (!valid(wLikes, 0, 10) || !valid(wComments, 0, 10)
				|| (wLikes === 0 && wComments === 0) || !valid(halfLifeHours, 1, 720)) return defaults();
			return {
				version: 'v2',
				wLikes,
				wBookmarks: DEFAULT_TRENDING_CONFIG.wBookmarks,
				wComments,
				decayHours: halfLifeHours
			};
		}

		if ((config.version !== undefined && config.version !== 'v2')
			|| !valid(wLikes, 0, 10) || !valid(wBookmarks, 0, 10) || !valid(wComments, 0, 10)
			|| (wLikes === 0 && wBookmarks === 0 && wComments === 0) || !valid(decayHours, 1, 720)) return defaults();
		return { version: 'v2', wLikes, wBookmarks, wComments, decayHours };
	} catch { return defaults(); }
}
export interface TrendingSignals { likes: number; bookmarks: number; comments: number; }
/** v2 = (ln(1+likes)+2ln(1+bookmarks)+3ln(1+independent commenters)) × 48h half-life. */
export function calculateTrendingScore(signals: TrendingSignals, createdAt: Date, config: TrendingConfig = DEFAULT_TRENDING_CONFIG, now = Date.now()): number {
	const ageHours = Math.max(0, (now - createdAt.getTime()) / 3_600_000);
	const engagement = config.wLikes * Math.log1p(Math.max(0, signals.likes)) + config.wBookmarks * Math.log1p(Math.max(0, signals.bookmarks)) + config.wComments * Math.log1p(Math.max(0, signals.comments));
	return engagement * Math.pow(0.5, ageHours / config.decayHours);
}
export interface ScoredTrendingItem { id: string; createdAt: Date; score: number; }
export function stableTrendingSort<T extends ScoredTrendingItem>(items: readonly T[]): T[] { return [...items].sort((a,b) => b.score-a.score || b.createdAt.getTime()-a.createdAt.getTime() || a.id.localeCompare(b.id)); }
