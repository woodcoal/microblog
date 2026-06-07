/**
 * Gorse 推荐系统客户端封装
 *
 * 提供与 Gorse 推荐引擎交互的统一接口，包括：
 * - 用户反馈（点赞/收藏/评论/浏览）的增删
 * - 帖子（Item）的同步（创建/更新/隐藏）
 * - 个性化推荐查询
 * - 相似帖子查询
 *
 * 核心设计：
 * - 单例模式，全局共享一个 Gorse 客户端实例
 * - 环境变量 GORSE_ENDPOINT 未设置时，所有方法静默跳过（优雅降级）
 * - 所有写操作异步非阻塞，失败仅记录日志，不冒泡异常
 * - 所有读操作失败时返回空结果，不影响页面渲染
 */

import { Gorse } from 'gorsejs';
import { GORSE_ENDPOINT, GORSE_API_KEY } from '@/lib/config';

/** Gorse 反馈类型常量 */
export const FEEDBACK_TYPE_LIKE = 'like';
export const FEEDBACK_TYPE_BOOKMARK = 'bookmark';
export const FEEDBACK_TYPE_COMMENT = 'comment';
export const FEEDBACK_TYPE_READ = 'read';

/** Gorse 反馈权重：点赞=1.0，评论=1.5，收藏=2.0，浏览=0（仅去重） */
export const FEEDBACK_VALUES: Record<string, number> = {
	[FEEDBACK_TYPE_LIKE]: 1.0,
	[FEEDBACK_TYPE_BOOKMARK]: 2.0,
	[FEEDBACK_TYPE_COMMENT]: 1.5,
	[FEEDBACK_TYPE_READ]: 0
};

/** Gorse 客户端单例（GORSE_ENDPOINT 未设置时为 null） */
let gorseClient: Gorse | null = null;

/**
 * 获取 Gorse 客户端实例
 *
 * 单例模式：首次调用时创建，后续复用。
 * GORSE_ENDPOINT 未设置时返回 null，所有依赖 Gorse 的功能将静默跳过。
 *
 * @returns Gorse 客户端实例，或 null（未配置时）
 */
function getGorseClient(): Gorse | null {
	if (!GORSE_ENDPOINT) {
		return null;
	}
	if (!gorseClient) {
		gorseClient = new Gorse({
			endpoint: GORSE_ENDPOINT,
			secret: GORSE_API_KEY || ''
		});
	}
	return gorseClient;
}

/**
 * 检查 Gorse 是否已启用
 *
 * @returns true 表示 Gorse 已配置且可用
 */
export function isGorseEnabled(): boolean {
	return getGorseClient() !== null;
}

/**
 * 插入用户反馈到 Gorse
 *
 * 将用户行为（点赞/收藏/评论/浏览）同步到 Gorse 推荐引擎。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param userId - 用户 ID
 * @param itemId - 帖子 ID（8 位短链）
 * @param feedbackType - 反馈类型：like / bookmark / comment / read
 * @param timestamp - 行为发生时间（ISO 字符串）
 */
export async function insertFeedback(
	userId: string,
	itemId: string,
	feedbackType: string,
	timestamp: string
): Promise<void> {
	const client = getGorseClient();
	if (!client) return;

	try {
		await client.insertFeedbacks([
			{
				FeedbackType: feedbackType,
				UserId: userId,
				ItemId: itemId,
				Value: FEEDBACK_VALUES[feedbackType] ?? 1.0,
				Timestamp: timestamp,
				Comment: ''
			}
		]);
	} catch (error) {
		console.error('[Gorse] 插入反馈失败:', error);
	}
}

/**
 * 删除用户反馈从 Gorse
 *
 * 取消点赞/收藏时，需要从 Gorse 中删除对应的反馈记录。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param userId - 用户 ID
 * @param itemId - 帖子 ID
 * @param feedbackType - 反馈类型
 */
export async function deleteFeedback(
	userId: string,
	itemId: string,
	feedbackType: string
): Promise<void> {
	const client = getGorseClient();
	if (!client) return;

	try {
		// gorsejs SDK 没有直接的 deleteFeedback 方法，使用 REST API
		await fetch(`${GORSE_ENDPOINT}/api/feedback/${feedbackType}/${userId}/${itemId}`, {
			method: 'DELETE',
			headers: GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}
		});
	} catch (error) {
		console.error('[Gorse] 删除反馈失败:', error);
	}
}

/**
 * 同步帖子到 Gorse（upsert）
 *
 * 创建或更新帖子时调用，将帖子信息同步到 Gorse。
 * 帖子的 categories 由分类 slug + 标签名组成，
 * labels 包含 mode 和标签列表，帮助推荐引擎理解内容特征。
 *
 * @param postId - 帖子 ID（8 位短链）
 * @param options - 帖子元数据
 * @param options.isDeleted - 是否已删除（隐藏）
 * @param options.categories - 分类列表（分类 slug + 标签名）
 * @param options.labels - 标签信息（mode、tags 等）
 * @param options.timestamp - 帖子创建/更新时间
 * @param options.comment - 备注信息（帖子标题或摘要）
 */
export async function upsertItem(
	postId: string,
	options: {
		isDeleted?: boolean;
		categories?: string[];
		labels?: Record<string, unknown>;
		timestamp: string;
		comment?: string;
	}
): Promise<void> {
	const client = getGorseClient();
	if (!client) return;

	try {
		await client.upsertItem({
			ItemId: postId,
			IsHidden: options.isDeleted ?? false,
			Categories: options.categories ?? [],
			Labels: options.labels ?? {},
			Timestamp: options.timestamp,
			Comment: options.comment ?? ''
		});
	} catch (error) {
		console.error('[Gorse] 同步帖子失败:', error);
	}
}

/**
 * 隐藏帖子（设置 IsHidden=true）
 *
 * 帖子被删除时调用，Gorse 仍可使用该帖子训练模型，
 * 但不再将其推荐给其他用户。
 *
 * @param postId - 帖子 ID
 */
export async function hideItem(postId: string): Promise<void> {
	const client = getGorseClient();
	if (!client) return;

	try {
		await client.upsertItem({
			ItemId: postId,
			IsHidden: true,
			Categories: [],
			Labels: {},
			Timestamp: new Date().toISOString(),
			Comment: ''
		});
	} catch (error) {
		console.error('[Gorse] 隐藏帖子失败:', error);
	}
}

/**
 * 获取个性化推荐帖子 ID 列表
 *
 * 根据用户的历史行为，返回推荐帖子 ID。
 * 可按分类过滤，返回结果已排除用户已读帖子。
 * Gorse API 返回格式：[{ Id: string, Score: number }]
 *
 * @param userId - 用户 ID
 * @param options - 查询选项
 * @param options.n - 返回数量（默认 10）
 * @param options.category - 可选，按分类过滤
 * @returns 推荐帖子 ID 数组，失败时返回空数组
 */
export async function getRecommendations(
	userId: string,
	options?: { n?: number; category?: string }
): Promise<string[]> {
	const client = getGorseClient();
	if (!client) return [];

	try {
		const result = await client.getRecommend({
			userId,
			cursorOptions: {
				n: options?.n ?? 10,
				...(options?.category ? { category: options.category } : {})
			}
		});
		// getRecommend 返回格式：[{ Id: string, Score: number }]
		if (Array.isArray(result)) {
			return result.map((item: any) => (typeof item === 'string' ? item : item.Id));
		}
		return [];
	} catch (error) {
		console.error('[Gorse] 获取推荐失败:', error);
		return [];
	}
}

/**
 * 获取相似帖子 ID 列表
 *
 * 基于帖子内容特征，返回与之相似的帖子。
 * 用于帖子详情页的"相关推荐"板块。
 * 需要在 gorse.toml 中配置 [[recommend.item-to-item]] 才能使用。
 *
 * @param itemId - 目标帖子 ID
 * @param options - 查询选项
 * @param options.n - 返回数量（默认 5）
 * @param options.name - item-to-item 推荐器名称（默认 "neighbors"）
 * @returns 相似帖子 ID 数组，失败时返回空数组
 */
export async function getSimilarItems(
	itemId: string,
	options?: { n?: number; name?: string }
): Promise<string[]> {
	const client = getGorseClient();
	if (!client) return [];

	try {
		// 使用 REST API 调用 item-to-item 推荐端点
		// 对应 gorse.toml 中的 [[recommend.item-to-item]] 配置
		const name = options?.name ?? 'neighbors';
		const n = options?.n ?? 5;
		const url = `${GORSE_ENDPOINT}/api/item-to-item/${name}/${itemId}?n=${n}`;
		const res = await fetch(url, {
			headers: GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}
		});
		if (!res.ok) return [];
		const data = await res.json();
		// 返回格式：[{ Id: string, Score: number }]
		if (Array.isArray(data)) {
			return data.map((item: any) => item.Id);
		}
		return [];
	} catch (error) {
		console.error('[Gorse] 获取相似帖子失败:', error);
		return [];
	}
}
