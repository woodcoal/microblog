/**
 * Agent API 共享工具函数
 *
 * 提供纯文本响应构建、认证适配、文本格式化、分页解析等工具，
 * 供所有 /api/agent/* 端点复用。
 */
import type { APIContext } from 'astro';
import { getUserFromBearerRequest, type JwtPayload } from '@/lib/auth';
import { getModeLabel } from '@/lib/config';
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';

// ─── 响应构建 ────────────────────────────────────────

/** 纯文本 Content-Type */
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/**
 * 构建纯文本成功响应
 *
 * @param text - 响应文本内容
 * @param status - HTTP 状态码，默认 200
 * @returns Response 对象
 */
export function textResponse(text: string, status: number = 200): Response {
	return new Response(text, { status, headers: { 'Content-Type': TEXT_CONTENT_TYPE } });
}

/**
 * 构建纯文本错误响应
 *
 * 格式：`error: 错误信息`
 *
 * @param message - 错误信息
 * @param status - HTTP 状态码，默认 400
 * @returns Response 对象
 */
export function textErrorResponse(message: string, status: number = 400): Response {
	return new Response(`error: ${message}`, {
		status,
		headers: { 'Content-Type': TEXT_CONTENT_TYPE }
	});
}

const SERVICE_ERROR_STATUS = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404
} as const;

/** 将 service 与请求解析错误转换为 Agent API 的纯文本错误契约。 */
export function handleAgentError(error: unknown, operation: string): Response {
	if (error instanceof ServiceError) {
		return textErrorResponse(error.message, SERVICE_ERROR_STATUS[error.code]);
	}
	if (
		error instanceof Error &&
		'status' in error &&
		typeof error.status === 'number' &&
		error.status >= 400 &&
		error.status < 500
	) {
		return textErrorResponse(error.message, error.status);
	}
	console.error(`${operation}失败:`, error);
	return textErrorResponse('服务器错误', 500);
}

// ─── 认证适配 ────────────────────────────────────────

/**
 * Agent 专用认证检查
 *
 * 仅接受 Authorization: Bearer，避免外部 API 回退到浏览器 Cookie。
 * 未认证时返回纯文本 401；Agent API 全部端点均要求认证。
 *
 * @param context - Astro APIContext
 * @returns 用户信息，未认证时返回纯文本 Response
 */
export async function requireAgentAuth(context: APIContext): Promise<JwtPayload | Response> {
	const user = await getUserFromBearerRequest(context.request);
	if (!user) {
		return textErrorResponse('请先登录', 401);
	}
	return user;
}

// ─── 分页 ────────────────────────────────────────

/** 分页默认值 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * 解析 page+limit 分页参数
 *
 * @param url - 请求 URL 对象
 * @returns page、limit 和 Prisma skip 值
 */
export function parsePagination(url: URL): { page: number; limit: number; skip: number } {
	const page = Math.max(Number(url.searchParams.get('page')) || DEFAULT_PAGE, 1);
	const limit = Math.min(
		Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1),
		MAX_LIMIT
	);
	return { page, limit, skip: (page - 1) * limit };
}

// ─── 关注关系查询 ────────────────────────────────────────

/**
 * 获取用户的关注/粉丝 ID 列表
 *
 * 供可见度过滤和 userScope 筛选复用，避免多个端点重复查询。
 *
 * @param userId - 当前用户 ID
 * @returns followingIds（当前用户关注的人）和 followerIds（关注当前用户的人）
 */
export async function getFollowIds(userId: string): Promise<{
	followingIds: string[];
	followerIds: string[];
}> {
	const following = await prisma.follow.findMany({
		where: { followerId: userId },
		select: { followingId: true }
	});
	const followers = await prisma.follow.findMany({
		where: { followingId: userId },
		select: { followerId: true }
	});
	return {
		followingIds: following.map((f) => f.followingId),
		followerIds: followers.map((f) => f.followerId)
	};
}

// ─── 帖子文本格式化 ────────────────────────────────────────

/** 帖子列表内容截断长度 */
const POST_LIST_CONTENT_MAX = 250;

/**
 * 格式化帖子列表项
 *
 * 格式：`- postid: 帖子内容（前250字）...`
 * 内容超过 250 字符时截断并追加 `...`
 *
 * @param post - 帖子对象，需含 id 和 content 字段
 * @returns 格式化的文本行
 */
export function formatPostListItem(post: { id: string; content: string }): string {
	const truncated =
		post.content.length > POST_LIST_CONTENT_MAX
			? post.content.slice(0, POST_LIST_CONTENT_MAX) + '...'
			: post.content;
	return `- ${post.id}: ${truncated}`;
}

/**
 * 格式化帖子详情（段标记格式）
 *
 * 输出结构：
 * ```
 * #POST postid @username [昵称] 2026-06-05T14:30:00Z
 *
 * 帖子内容...
 *
 * #COMMENTS
 * - commentid: 2026-06-05T14:35:00Z @username [昵称] 评论内容
 *   - replyid / commentid: 2026-06-05T14:40:00Z @username [昵称] 回复内容
 *
 * #MEDIA
 * ![name](url)
 * ```
 * 无评论或无媒体时对应段落省略。
 *
 * @param post - 帖子对象，含作者、媒体等信息
 * @param comments - 可选的评论列表（一级评论含嵌套回复）
 * @returns 格式化的详情文本
 */
export function formatPostDetail(
	post: {
		id: string;
		content: string;
		createdAt: Date;
		user: { username: string; displayName: string; deletedAt?: Date | null };
		media?: Array<{ fileStorage: { filePath: string; fileType: string } }>;
	},
	comments?: Array<{
		id: string;
		content: string;
		createdAt: Date;
		isDeleted: boolean;
		user: { username: string; displayName: string; deletedAt?: Date | null };
		replies?: Array<{
			id: string;
			content: string;
			parentId: string;
			createdAt: Date;
			isDeleted: boolean;
			user: { username: string; displayName: string; deletedAt?: Date | null };
		}>;
	}>
): string {
	const lines: string[] = [];

	// #POST 段
	const displayName = post.user.displayName || post.user.username;
	lines.push(
		`#POST ${post.id} @${post.user.username} [${displayName}] ${post.createdAt.toISOString()}`
	);
	lines.push('');
	lines.push(post.content);

	// #COMMENTS 段
	if (comments && comments.length > 0) {
		lines.push('');
		lines.push('#COMMENTS');
		for (const comment of comments) {
			const cDisplayName = comment.user.deletedAt
				? '已注销用户'
				: comment.user.displayName || comment.user.username;
			const cContent = comment.isDeleted ? '该内容已删除' : comment.content;
			lines.push(
				`- ${comment.id}: ${comment.createdAt.toISOString()} ${comment.user.deletedAt ? '[已注销用户]' : `@${comment.user.username} [${cDisplayName}]`} ${cContent}`
			);
			// 嵌套回复
			if (comment.replies && comment.replies.length > 0) {
				for (const reply of comment.replies) {
					const rDisplayName = reply.user.deletedAt
						? '已注销用户'
						: reply.user.displayName || reply.user.username;
					const rContent = reply.isDeleted ? '该内容已删除' : reply.content;
					lines.push(
						`  - ${reply.id} / ${reply.parentId}: ${reply.createdAt.toISOString()} ${reply.user.deletedAt ? '[已注销用户]' : `@${reply.user.username} [${rDisplayName}]`} ${rContent}`
					);
				}
			}
		}
	}

	// #MEDIA 段
	if (post.media && post.media.length > 0) {
		const imageMedia = post.media.filter((m) => m.fileStorage.fileType === 'image');
		if (imageMedia.length > 0) {
			lines.push('');
			lines.push('#MEDIA');
			for (const m of imageMedia) {
				const url = `/uploads/${m.fileStorage.filePath}`;
				// 从 filePath 提取文件名作为 alt
				const parts = m.fileStorage.filePath.split('/');
				const fileName = parts[parts.length - 1] || 'image';
				lines.push(`![${fileName}](${url})`);
			}
		}
	}

	return lines.join('\n');
}

// ─── 用户文本格式化 ────────────────────────────────────────

/**
 * 格式化用户列表项
 *
 * 格式：`- username: 昵称`
 *
 * @param user - 用户对象，需含 username 和 displayName
 * @returns 格式化的文本行
 */
export function formatUserListItem(user: { username: string; displayName: string }): string {
	return `- ${user.username}: ${user.displayName || user.username}`;
}

/**
 * 格式化用户详情
 *
 * 输出格式：
 * ```
 * username / 昵称
 *
 * 简介：xxx
 * 头像：xxx
 * 微博：128  关注：56  粉丝：230
 * 注册时间：2025-03-15
 * ```
 *
 * @param user - 用户详情对象
 * @returns 格式化的详情文本
 */
export function formatUserDetail(user: {
	username: string;
	displayName: string;
	bio: string;
	avatarUrl: string;
	createdAt: Date;
	_count: {
		posts: number;
		following: number;
		followers: number;
	};
}): string {
	const lines: string[] = [];
	lines.push(`${user.username} / ${user.displayName || user.username}`);
	if (user.bio) {
		lines.push(`简介：${user.bio}`);
	}
	if (user.avatarUrl) {
		lines.push(`头像：${user.avatarUrl}`);
	}
	lines.push(
		`${getModeLabel('weibo')}动态：${user._count.posts}  关注：${user._count.following}  粉丝：${user._count.followers}`
	);
	lines.push(`注册时间：${user.createdAt.toISOString().slice(0, 10)}`);
	return lines.join('\n');
}

// ─── 通知文本格式化 ────────────────────────────────────────

/** 通知类型的中文操作描述映射 */
const NOTIFICATION_ACTION_MAP: Record<string, string> = {
	comment: '评论了',
	like: '赞了',
	follow: '关注了你',
	mention: '在帖子中提及了你'
};

/**
 * 格式化通知列表项
 *
 * 格式：`- 通知id: 类型 @username 操作 帖子标识`
 *
 * @param n - 通知对象，含 actor 信息
 * @returns 格式化的文本行
 */
export function formatNotificationItem(n: {
	id: string;
	type: string;
	postId: string | null;
	actor: { username: string; displayName: string };
}): string {
	const action = NOTIFICATION_ACTION_MAP[n.type] || n.type;
	const displayName = n.actor.displayName || n.actor.username;
	const postRef = n.postId ? ` ${n.postId}` : '';
	return `- ${n.id}: ${n.type} @${n.actor.username} [${displayName}] ${action}${postRef}`;
}
