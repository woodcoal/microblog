/**
 * Agent 个人资料修改 API
 *
 * PUT /api/agent/profile — 修改当前用户的个人资料
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAgentAuth, textResponse, textErrorResponse } from '@/lib/agent';
import { parseJsonBody } from '@/lib/utils';

/** 显示名最大长度 */
const DISPLAY_NAME_MAX_LENGTH = 50;
/** 简介最大长度 */
const BIO_MAX_LENGTH = 160;

/**
 * 修改个人资料
 *
 * 支持更新 displayName（1-50字符）、bio（最多160字符）、avatarUrl。
 * 只更新请求体中传入的字段，未传入的字段保持不变。
 *
 * @param context - Astro API 上下文
 * @returns `ok` 或 `error: 原因`
 */
export const PUT: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;
		const currentUser = authResult;

		const body = await parseJsonBody(context.request);
		const { displayName, bio, avatarUrl } = body as {
			displayName?: string;
			bio?: string;
			avatarUrl?: string;
		};

		// 验证 displayName
		if (displayName !== undefined) {
			if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
				return textErrorResponse(`显示名长度需在 1-${DISPLAY_NAME_MAX_LENGTH} 字符之间`);
			}
		}

		// 验证 bio
		if (bio !== undefined && bio.length > BIO_MAX_LENGTH) {
			return textErrorResponse(`简介最多 ${BIO_MAX_LENGTH} 字符`);
		}

		// 验证 avatarUrl 格式（允许本站相对路径 /uploads/ 或绝对 URL）
		if (avatarUrl !== undefined && avatarUrl !== '' && avatarUrl !== null) {
			const isLocalPath = avatarUrl.startsWith('/uploads/');
			if (!isLocalPath) {
				try {
					new URL(avatarUrl);
				} catch {
					return textErrorResponse('头像 URL 格式无效');
				}
			}
		}

		// 构建更新数据（只更新传入的字段）
		const updateData: { displayName?: string; bio?: string; avatarUrl?: string } = {};
		if (displayName !== undefined) updateData.displayName = displayName;
		if (bio !== undefined) updateData.bio = bio;
		if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl ?? '';

		await prisma.user.update({
			where: { id: currentUser.userId },
			data: updateData
		});

		return textResponse('ok');
	} catch (error: any) {
		if (error?.status === 400) {
			return textErrorResponse(error.message, 400);
		}
		console.error('更新个人资料失败:', error);
		return textErrorResponse('服务器错误', 500);
	}
};
