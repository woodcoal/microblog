/**
 * Agent 帖子 API
 *
 * GET  /api/agent/posts — 帖子列表（多过滤、可见度过滤、hot排序）
 * POST /api/agent/posts — 发帖
 * 面向自动化 Agent 的稳定纯文本接口；通用客户端优先使用 /api/v1。
 */
import type { APIRoute } from 'astro';
import {
	requireAgentAuth,
	textResponse,
	textErrorResponse,
	parsePagination,
	getFollowIds,
	formatPostListItem,
	handleAgentError
} from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { getPosts, createPost } from '@/services/content.service';

/** Agent API 不支持的可见度类型 */
const AGENT_UNSUPPORTED_VISIBILITIES = ['password', 'users'];

// ═══════════════════════════════════════════════════════════════════
// GET — 帖子列表
// ═══════════════════════════════════════════════════════════════════

/**
 * 获取帖子列表
 *
 * 参数：keyword, tag, from, to, user, userScope, sort, page, limit
 * 支持可见度过滤和 hot 排序。
 *
 * @param context - Astro API 上下文
 * @returns 纯文本格式的帖子列表
 */
export const GET: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const url = new URL(context.request.url);
		const keyword = url.searchParams.get('keyword')?.trim() || undefined;
		const tag = url.searchParams.get('tag')?.trim() || undefined;
		const fromStr = url.searchParams.get('from');
		const toStr = url.searchParams.get('to');
		const targetUsername = url.searchParams.get('user')?.trim() || undefined;
		const userScope = url.searchParams.get('userScope') || 'all';
		const sort = url.searchParams.get('sort') || 'latest';
		const { limit, skip } = parsePagination(url);

		// 时间范围解析
		let from: Date | undefined;
		let to: Date | undefined;
		if (fromStr) {
			from = new Date(fromStr);
			if (isNaN(from.getTime())) return textErrorResponse('起始时间格式无效');
		}
		if (toStr) {
			to = new Date(toStr);
			if (isNaN(to.getTime())) return textErrorResponse('结束时间格式无效');
		}
		if (!['all', 'followers', 'following'].includes(userScope)) {
			return textErrorResponse('userScope 必须为 all、followers 或 following');
		}
		if (!['latest', 'earliest', 'hot'].includes(sort)) {
			return textErrorResponse('sort 必须为 latest、earliest 或 hot');
		}

		// 获取关注关系
		const { followingIds, followerIds } = await getFollowIds(currentUser.userId);

		// 委托 service 层查询
		const result = await getPosts({
			userId: currentUser.userId,
			keyword,
			tag,
			from,
			to,
			targetUsername,
			userScope,
			sort,
			skip,
			limit,
			followingIds,
			followerIds
		});

		return textResponse(result.map((post) => formatPostListItem(post)).join('\n'));
	} catch (error) {
		console.error('获取帖子列表失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};

// ═══════════════════════════════════════════════════════════════════
// POST — 发帖
// ═══════════════════════════════════════════════════════════════════

/**
 * 创建新帖子
 *
 * 参数：content（内容）、imageUrls（图片 URL 数组）、visibility（可见度）
 * Agent API 不支持 password/users 可见度。
 *
 * @param context - Astro API 上下文
 * @returns `ok: postid` 或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { content, imageUrls, images, visibility } = body as {
			content?: string;
			imageUrls?: string[];
			/** 兼容早期代码实际使用、但未正式发布的字段名。 */
			images?: string[];
			visibility?: string;
		};

		// 验证内容
		if (!content?.trim()) {
			return textErrorResponse('帖子内容不能为空');
		}

		// 验证并规范化可见度（完整校验由 service 层负责）
		// mutual 是早期 Agent 技能公开过的别名；产品标准名称为 following。
		const vis = visibility === 'mutual' ? 'following' : visibility || 'public';
		if (AGENT_UNSUPPORTED_VISIBILITIES.includes(vis)) {
			return textErrorResponse('Agent API 不支持 password/users 可见度');
		}

		// 委托 service 层创建帖子（图片 URL 转换由 service 层处理）
		const result = await createPost({
			userId: currentUser.userId,
			content,
			visibility: vis,
			images: imageUrls ?? images
		});

		return textResponse('ok: ' + result.id, 201);
	} catch (error) {
		return handleAgentError(error, '创建帖子');
	}
};
