/**
 * DaLi.Lens 推荐与搜索中间件客户端封装
 *
 * 提供与 DaLi.Lens 服务交互的统一接口，包括：
 * - 文档（帖子）入库/更新/删除
 * - 用户创建/查询/删除
 * - 个性化推荐与相似文档查询
 * - 用户反馈上报（fav/click/view/comment）
 * - 用户画像与兴趣查询
 *
 * 核心设计：
 * - 单例模式，全局共享一个客户端配置
 * - 环境变量 LENS_ENDPOINT 未设置时，所有方法静默跳过（优雅降级）
 * - 所有写操作异步非阻塞，失败仅记录日志，不冒泡异常
 * - 所有读操作失败时返回空结果，不影响页面渲染
 *
 * 反馈类型映射（项目行为 → DaLi.Lens 反馈动作）：
 * - 收藏（bookmark）→ fav
 * - 点赞（like）    → click（点赞本质是点击行为，作为弱正向信号）
 * - 浏览（read）    → view
 * - 评论（comment） → comment
 */

import { LENS_ENDPOINT, LENS_API_KEY } from '@/lib/config';

/** DaLi.Lens 反馈动作常量 */
export const FEEDBACK_ACTION_FAV = 'fav';
export const FEEDBACK_ACTION_CLICK = 'click';
export const FEEDBACK_ACTION_VIEW = 'view';
export const FEEDBACK_ACTION_COMMENT = 'comment';

/** DaLi.Lens 统一响应结构 */
interface LensResponse<T> {
	success: boolean;
	data: T | null;
	error: { code: string; message: string } | null;
}

/** 文档入库请求体 */
export interface LensDocumentInput {
	externalId: string;
	title: string;
	content: string;
	category?: string;
}

/** 文档入库响应数据 */
export interface LensDocumentResult {
	id: string;
	externalId: string;
	status: string;
	createdAt: string;
}

/** 推荐项结构 */
export interface LensRecommendationItem {
	documentId: string;
	title: string;
	summary: string;
	category: string;
	score: number;
}

/** 推荐列表响应数据 */
export interface LensRecommendationData {
	userId: string;
	items: LensRecommendationItem[];
}

/** 用户创建请求体 */
export interface LensUserInput {
	userId: string;
	username: string;
	metadata?: string;
}

/** 用户画像分类项 */
export interface LensCategoryWeight {
	category: string;
	weight: number;
}

/** 用户画像数据 */
export interface LensUserProfile {
	userId: string;
	interactionCount: number;
	topCategories: LensCategoryWeight[];
	lastUpdatedAt: string;
}

/**
 * 检查 DaLi.Lens 是否已启用
 *
 * LENS_ENDPOINT 未设置时返回 false，所有依赖 Lens 的功能将静默跳过。
 *
 * @returns true 表示 Lens 已配置且可用
 */
export function isLensEnabled(): boolean {
	return !!LENS_ENDPOINT;
}

/**
 * 统一 API 调用函数
 *
 * 封装认证头、错误处理和响应解析。
 * 业务层失败（success=false）时抛出包含错误码的对象，由调用方决定如何处理。
 *
 * @param path - API 路径（以 /api 开头）
 * @param options - fetch 选项（method、body 等）
 * @returns 成功时返回 data 字段内容
 */
async function callLens<T>(path: string, options: RequestInit = {}): Promise<T> {
	const url = `${LENS_ENDPOINT}${path}`;
	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${LENS_API_KEY}`,
			'Content-Type': 'application/json',
			...options.headers
		}
	});

	const result = (await response.json()) as LensResponse<T>;

	if (!result.success) {
		throw {
			code: result.error?.code ?? 'UNKNOWN',
			message: result.error?.message ?? '未知错误',
			status: response.status
		};
	}

	return result.data as T;
}

// ── 文档（帖子）管理 ──

/**
 * 推送文档到 DaLi.Lens（入库）
 *
 * 将帖子内容推送到 Lens，系统自动完成分块、向量化、摘要生成。
 * externalId 使用帖子的 8 位短链 ID，渠道内唯一。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param doc - 文档信息（externalId、title、content、category）
 */
export async function ingestDocument(doc: LensDocumentInput): Promise<void> {
	if (!isLensEnabled()) return;

	try {
		await callLens<LensDocumentResult>('/api/documents', {
			method: 'POST',
			body: JSON.stringify(doc)
		});
	} catch (error) {
		// CONFLICT（文档已存在）时尝试更新
		if ((error as any)?.code === 'CONFLICT') {
			await updateDocument(doc.externalId, doc).catch(() => {});
			return;
		}
		console.error('[Lens] 文档入库失败:', error);
	}
}

/**
 * 更新文档内容
 *
 * 更新后文档状态重置为 pending，系统重新处理。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param externalId - 外部文档 ID（帖子短链 ID）
 * @param doc - 更新后的完整文档
 */
export async function updateDocument(externalId: string, doc: LensDocumentInput): Promise<void> {
	if (!isLensEnabled()) return;

	try {
		await callLens<LensDocumentResult>(`/api/documents/${externalId}`, {
			method: 'PUT',
			body: JSON.stringify(doc)
		});
	} catch (error) {
		console.error('[Lens] 文档更新失败:', error);
	}
}

/**
 * 删除文档
 *
 * 删除文档及其所有向量数据，删除后不再出现在推荐和检索结果中。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param externalId - 外部文档 ID（帖子短链 ID）
 */
export async function deleteDocument(externalId: string): Promise<void> {
	if (!isLensEnabled()) return;

	try {
		await callLens<{ deleted: boolean }>(`/api/documents/${externalId}`, {
			method: 'DELETE'
		});
	} catch (error) {
		console.error('[Lens] 文档删除失败:', error);
	}
}

// ── 用户管理 ──

/**
 * 创建用户到 DaLi.Lens
 *
 * 用户注册时调用，将用户信息同步到 Lens 用于构建画像。
 * userId 已存在时（CONFLICT）静默忽略。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param user - 用户信息（userId、username、metadata）
 */
export async function createUser(user: LensUserInput): Promise<void> {
	if (!isLensEnabled()) return;

	try {
		await callLens<unknown>('/api/users', {
			method: 'POST',
			body: JSON.stringify(user)
		});
	} catch (error) {
		// CONFLICT（用户已存在）静默忽略
		if ((error as any)?.code === 'CONFLICT') return;
		console.error('[Lens] 用户创建失败:', error);
	}
}

// ── 推荐查询 ──

/**
 * 获取个性化推荐文档列表
 *
 * 根据用户画像返回最匹配其兴趣的文档。
 * 新用户（无画像）会收到最近入库的热门文档（冷启动处理）。
 * 返回的 documentId 即帖子的 externalId（短链 ID）。
 *
 * @param userId - 业务用户 ID
 * @param options - 查询选项
 * @param options.topK - 返回数量，默认 10
 * @param options.category - 可选，按分类过滤
 * @returns 推荐文档数组，失败时返回空数组
 */
export async function getRecommendations(
	userId: string,
	options?: { topK?: number; category?: string }
): Promise<LensRecommendationItem[]> {
	if (!isLensEnabled()) return [];

	try {
		const params = new URLSearchParams();
		if (options?.topK) params.set('topK', String(options.topK));
		if (options?.category) params.set('category', options.category);

		const data = await callLens<LensRecommendationData>(
			`/api/public/recommendations/${userId}?${params}`
		);
		return data.items ?? [];
	} catch (error) {
		console.error('[Lens] 获取推荐失败:', error);
		return [];
	}
}

/**
 * 获取相似文档列表
 *
 * 查找与指定文档相似的其他文档，适用于详情页"相关推荐"。
 *
 * @param userId - 业务用户 ID
 * @param externalId - 当前文档的外部 ID（帖子短链 ID）
 * @param topK - 返回数量，默认 5
 * @returns 相似文档数组，失败时返回空数组
 */
export async function getSimilarDocuments(
	userId: string,
	externalId: string,
	topK = 5
): Promise<LensRecommendationItem[]> {
	if (!isLensEnabled()) return [];

	try {
		const data = await callLens<LensRecommendationData>(
			`/api/public/recommendations/${userId}/similar/${externalId}?topK=${topK}`
		);
		return data.items ?? [];
	} catch (error) {
		console.error('[Lens] 获取相似文档失败:', error);
		return [];
	}
}

// ── 反馈系统 ──

/**
 * 提交用户反馈
 *
 * 将用户行为（收藏/点赞/浏览/评论）同步到 Lens，用于更新用户画像。
 * 反馈越多，推荐越准。
 * 异步非阻塞，失败仅记录日志。
 *
 * @param userId - 业务用户 ID
 * @param documentId - 外部文档 ID（帖子短链 ID）
 * @param action - 反馈动作：fav / click / view / comment
 */
export async function submitFeedback(
	userId: string,
	documentId: string,
	action: string
): Promise<void> {
	if (!isLensEnabled()) return;

	try {
		await callLens<{ success: boolean }>(`/api/users/${userId}/feedback`, {
			method: 'POST',
			body: JSON.stringify({ documentId, action })
		});
	} catch (error) {
		console.error('[Lens] 提交反馈失败:', error);
	}
}

// ── 用户画像 ──

/**
 * 获取用户画像
 *
 * 返回用户的交互统计和分类偏好。
 * 新用户（无画像数据）返回 null。
 *
 * @param userId - 业务用户 ID
 * @returns 用户画像数据，不存在或失败时返回 null
 */
export async function getUserProfile(userId: string): Promise<LensUserProfile | null> {
	if (!isLensEnabled()) return null;

	try {
		return await callLens<LensUserProfile>(`/api/users/${userId}/profile`);
	} catch (error) {
		// NOT_FOUND 表示新用户尚无画像，返回 null
		if ((error as any)?.code === 'NOT_FOUND') return null;
		console.error('[Lens] 获取用户画像失败:', error);
		return null;
	}
}
