/**
 * 热门排序算法模块
 *
 * 基于点赞数、评论数和时间衰减计算内容的热门分数，
 * 用于对动态进行热门排序。时间衰减采用指数衰减模型，
 * 越新的内容分数越高，随时间推移分数逐渐降低。
 */

import { getEnv } from './config';

/**
 * 热门排序配置接口
 *
 * @property wLikes - 点赞权重，控制点赞数对热门分数的影响程度，默认1
 * @property wComments - 评论权重，控制评论数对热门分数的影响程度，默认2
 * @property decayHours - 时间衰减半衰期（小时），控制分数随时间衰减的速度，默认24
 */
interface TrendingConfig {
	wLikes: number;
	wComments: number;
	decayHours: number;
}

/** 默认热门排序配置 */
const DEFAULT_CONFIG: TrendingConfig = {
	wLikes: 1,
	wComments: 2,
	decayHours: 24
};

/** 缓存的热门排序配置，避免每次调用都重新解析环境变量 */
let cachedConfig: TrendingConfig | null = null;

/**
 * 从环境变量解析热门排序配置（带缓存）
 *
 * 读取环境变量 TRENDING_FORMULA（JSON 格式）并解析为 TrendingConfig。
 * 解析失败时（格式错误、字段缺失等）使用默认值。
 * 首次解析后缓存结果，后续调用直接返回缓存。
 *
 * JSON 示例：{"wLikes": 1, "wComments": 2, "decayHours": 24}
 *
 * @returns 解析后的热门排序配置，解析失败时返回默认配置
 */
function parseTrendingConfig(): TrendingConfig {
	// 缓存命中直接返回
	if (cachedConfig) {
		return cachedConfig;
	}

	const raw = getEnv('TRENDING_FORMULA');
	if (!raw) {
		cachedConfig = { ...DEFAULT_CONFIG };
		return cachedConfig;
	}

	try {
		const parsed = JSON.parse(raw);
		cachedConfig = {
			wLikes: typeof parsed.wLikes === 'number' ? parsed.wLikes : DEFAULT_CONFIG.wLikes,
			wComments:
				typeof parsed.wComments === 'number' ? parsed.wComments : DEFAULT_CONFIG.wComments,
			decayHours:
				typeof parsed.decayHours === 'number'
					? parsed.decayHours
					: DEFAULT_CONFIG.decayHours
		};
	} catch {
		// JSON 解析失败，使用默认配置
		cachedConfig = { ...DEFAULT_CONFIG };
	}

	return cachedConfig;
}

/**
 * 计算热门分数
 *
 * 根据点赞数、评论数和创建时间计算内容的热门分数。
 * 公式：score = likes * wLikes + comments * wComments * exp(-hours / decayHours)
 *
 * 其中 hours 为内容创建至今的小时数，衰减项使越旧的内容分数越低。
 * 评论数受时间衰减影响更大，确保新内容的评论权重更高。
 *
 * @param likes - 点赞数
 * @param comments - 评论数
 * @param createdAt - 内容创建时间（Date 对象或可解析的时间戳）
 * @returns 热门分数，数值越高表示越热门
 */
export function calculateTrendingScore(likes: number, comments: number, createdAt: Date): number {
	const config = parseTrendingConfig();

	// 计算内容创建至今的小时数
	const hours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

	// 应用指数时间衰减：越旧的内容衰减越大
	const decay = Math.exp(-hours / config.decayHours);

	// 计算最终热门分数
	const score = likes * config.wLikes + comments * config.wComments * decay;

	return score;
}
