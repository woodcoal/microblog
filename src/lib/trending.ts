/** Pure MT-86 v2 trending configuration, scoring, and deterministic ordering. */
export interface TrendingConfig { version: 'v2'; wLikes: number; wBookmarks: number; wComments: number; decayHours: number; }
export const DEFAULT_TRENDING_CONFIG: TrendingConfig = { version: 'v2', wLikes: 1, wBookmarks: 2, wComments: 3, decayHours: 48 };
const valid = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Parses v2 atomically; a complete legacy object is migrated, every other invalid value resets as a whole. */
export function parseTrendingConfig(raw?: string): TrendingConfig {
	if (!raw) return { ...DEFAULT_TRENDING_CONFIG };
	try {
		const value = JSON.parse(raw) as Record<string, unknown>;
		const version = value.version;
		const compatible = version === 'v2' || version === undefined;
		if (!compatible || !valid(value.wLikes, 0, 10) || !valid(value.wBookmarks, 0, 10) || !valid(value.wComments, 0, 10) || !valid(value.decayHours, 1, 168)) return { ...DEFAULT_TRENDING_CONFIG };
		return { version: 'v2', wLikes: value.wLikes as number, wBookmarks: value.wBookmarks as number, wComments: value.wComments as number, decayHours: value.decayHours as number };
	} catch { return { ...DEFAULT_TRENDING_CONFIG }; }
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
