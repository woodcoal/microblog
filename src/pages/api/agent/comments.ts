/**
 * Agent 评论 API
 *
 * POST /api/agent/comments — 发表评论或回复
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';
import { createNotification } from '@/lib/notification';
import { logActivity, COMMENT_CREATE } from '@/lib/activity';

/** 评论内容最大长度 */
const COMMENT_MAX_LENGTH = 1000;

/**
 * 发表评论或回复
 *
 * 参数：postId（帖子标识）、content（评论内容）、parentId（可选，回复的评论 ID）
 * parentId 存在时为二级评论回复，必须是一级评论（不支持多级嵌套）。
 *
 * @param context - Astro API 上下文
 * @returns `ok: commentid` 或 `error: 原因`
 */
export const POST: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { postId, content, parentId } = body as {
			postId?: string;
			content?: string;
			parentId?: string;
		};

		// 参数校验
		if (!postId?.trim()) {
			return textErrorResponse('帖子标识不能为空');
		}
		if (!content?.trim()) {
			return textErrorResponse('评论内容不能为空');
		}
		if (content.length > COMMENT_MAX_LENGTH) {
			return textErrorResponse(`评论不能超过 ${COMMENT_MAX_LENGTH} 个字符`);
		}

		// 验证帖子存在、未删除、未锁定
		const post = await prisma.post.findUnique({ where: { id: postId.trim() } });
		if (!post) {
			return textErrorResponse('帖子不存在', 404);
		}
		if (post.isDeleted) {
			return textErrorResponse('帖子已删除，无法评论');
		}
		if (post.isLocked) {
			return textErrorResponse('帖子已锁定，无法评论', 403);
		}

		// 验证 parentId 属于同一帖子且是一级评论
		if (parentId) {
			const parentComment = await prisma.comment.findUnique({
				where: { id: parentId }
			});
			if (!parentComment) {
				return textErrorResponse('回复的评论不存在', 404);
			}
			if (parentComment.postId !== postId.trim()) {
				return textErrorResponse('回复的评论不属于该帖子');
			}
			// 不允许回复二级评论（只支持两级）
			if (parentComment.parentId) {
				return textErrorResponse('不支持多级嵌套回复');
			}
		}

		// 创建评论
		const comment = await prisma.comment.create({
			data: {
				postId: postId.trim(),
				userId: currentUser.userId,
				parentId: parentId || null,
				content: content.trim()
			}
		});

		// 异步发送通知 + 记录活动
		createNotification('comment', currentUser.userId, post.userId, post.id, comment.id).catch(() => {});
		logActivity(COMMENT_CREATE, currentUser.userId, 'comment', comment.id, post.userId, post.id).catch(() => {});

		return textResponse(`ok: ${comment.id}`, 201);
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('发表评论失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
