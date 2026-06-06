/**
 * 通用设置 API
 *
 * GET  /api/settings      — 获取当前用户设置（含 User 基本信息）
 * PUT  /api/settings      — 更新主题和评论排序偏好
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isValidTheme, isValidAccent, DEFAULT_THEME, DEFAULT_ACCENT } from '@/lib/theme';
import { successResponse, jsonErrorResponse, parseJsonBody } from '@/lib/utils';

/** 评论排序合法值 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/**
 * 获取当前用户设置
 *
 * 返回 UserSettings（theme, commentSortOrder）+ User 基本信息（displayName, bio, avatarUrl）。
 * 如果 UserSettings 不存在，返回默认值。
 *
 * @param context - Astro API 上下文
 * @returns 设置数据或错误
 */
export const GET: APIRoute = async (context) => {
	try {
		// 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 并行查询用户设置和用户基本信息
		const [settings, user] = await Promise.all([
			prisma.userSettings.findUnique({
				where: { userId: currentUser.userId }
			}),
			prisma.user.findUnique({
				where: { id: currentUser.userId },
				select: {
					displayName: true,
					bio: true,
					avatarUrl: true
				}
			})
		]);

		// 合并设置与用户信息，设置不存在时使用默认值
		return new Response(
			JSON.stringify(
				successResponse({
					theme: settings?.theme ?? DEFAULT_THEME,
					accent: settings?.accent ?? DEFAULT_ACCENT,
					commentSortOrder: settings?.commentSortOrder ?? 'asc',
					notificationsEnabled: settings?.notificationsEnabled ?? true,
					displayName: user?.displayName ?? '',
					bio: user?.bio ?? '',
					avatarUrl: user?.avatarUrl ?? ''
				})
			),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('获取设置失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};

/**
 * 更新主题和评论排序偏好
 *
 * 使用 upsert：如果 UserSettings 不存在则创建。
 * 验证 theme 合法性（通过 isValidTheme）和 commentSortOrder 合法性（asc/desc）。
 *
 * @param context - Astro API 上下文
 * @returns 更新后的设置数据或错误
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
		const { theme, accent, commentSortOrder, notificationsEnabled } = body as {
			theme?: string;
			accent?: string;
			commentSortOrder?: string;
			notificationsEnabled?: boolean;
		};

		// 2. 验证 theme 合法性
		if (theme !== undefined && !isValidTheme(theme)) {
			return jsonErrorResponse('无效的主题');
		}

		// 3. 验证 accent 合法性
		if (accent !== undefined && !isValidAccent(accent)) {
			return jsonErrorResponse('无效的强调色');
		}

		// 4. 验证 commentSortOrder 合法性
		if (commentSortOrder !== undefined && !VALID_SORT_ORDERS.includes(commentSortOrder)) {
			return jsonErrorResponse('排序值必须为 asc 或 desc');
		}

		// 5. 构建更新数据（只更新传入的字段）
		const updateData: {
			theme?: string;
			accent?: string;
			commentSortOrder?: string;
			notificationsEnabled?: boolean;
		} = {};
		if (theme !== undefined) updateData.theme = theme;
		if (accent !== undefined) updateData.accent = accent;
		if (commentSortOrder !== undefined) updateData.commentSortOrder = commentSortOrder;
		if (notificationsEnabled !== undefined)
			updateData.notificationsEnabled = notificationsEnabled;

		// 6. upsert 更新或创建 UserSettings
		const settings = await prisma.userSettings.upsert({
			where: { userId: currentUser.userId },
			update: updateData,
			create: {
				userId: currentUser.userId,
				theme: theme ?? DEFAULT_THEME,
				accent: accent ?? DEFAULT_ACCENT,
				commentSortOrder: commentSortOrder ?? 'asc',
				notificationsEnabled: notificationsEnabled ?? true
			}
		});

		// 7. 返回更新后的设置
		return new Response(
			JSON.stringify(
				successResponse({
					theme: settings.theme,
					accent: settings.accent,
					commentSortOrder: settings.commentSortOrder,
					notificationsEnabled: settings.notificationsEnabled
				})
			),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error: any) {
		// 处理 parseJsonBody 抛出的 400 错误
		if (error?.status === 400) {
			return jsonErrorResponse(error.message, 400);
		}
		console.error('更新设置失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
