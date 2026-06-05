/**
 * 个人资料更新 API
 *
 * PUT /api/settings/profile — 更新当前用户的个人资料
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 显示名最大长度 */
const DISPLAY_NAME_MAX_LENGTH = 50;
/** 简介最大长度 */
const BIO_MAX_LENGTH = 160;

/**
 * 更新个人资料
 *
 * 支持更新 displayName（1-50字符）、bio（最多160字符）、avatarUrl。
 * 只更新请求体中传入的字段，未传入的字段保持不变。
 *
 * @param context - Astro API 上下文
 * @returns 更新后的个人资料或错误
 */
export const PUT: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 解析请求体
		const body = await parseJsonBody(context.request);
		const { displayName, bio, avatarUrl } = body as {
			displayName?: string;
			bio?: string;
			avatarUrl?: string;
		};

		// 2. 验证 displayName
		if (displayName !== undefined) {
			if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
				return jsonErrorResponse(`显示名长度需在 1-${DISPLAY_NAME_MAX_LENGTH} 字符之间`);
			}
		}

		// 3. 验证 bio
		if (bio !== undefined && bio.length > BIO_MAX_LENGTH) {
			return jsonErrorResponse(`简介最多 ${BIO_MAX_LENGTH} 字符`);
		}

		// 4. 验证 avatarUrl 格式（允许本站相对路径 /uploads/ 或绝对 URL）
		if (avatarUrl !== undefined && avatarUrl !== '' && avatarUrl !== null) {
			const isLocalPath = avatarUrl.startsWith('/uploads/');
			if (!isLocalPath) {
				try {
					new URL(avatarUrl);
				} catch {
					return jsonErrorResponse('头像 URL 格式无效');
				}
			}
		}

		// 4. 构建更新数据（只更新传入的字段）
		const updateData: {
			displayName?: string;
			bio?: string;
			avatarUrl?: string;
		} = {};
		if (displayName !== undefined) updateData.displayName = displayName;
		if (bio !== undefined) updateData.bio = bio;
		if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

		// 5. 更新 User 表
		const updatedUser = await prisma.user.update({
			where: { id: currentUser.userId },
			data: updateData,
			select: {
				displayName: true,
				bio: true,
				avatarUrl: true
			}
		});

		// 6. 返回更新后的个人资料
		return new Response(JSON.stringify(successResponse(updatedUser)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('更新个人资料失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
