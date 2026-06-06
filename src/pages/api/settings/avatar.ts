/**
 * 头像上传 API
 *
 * POST /api/settings/avatar — 上传用户头像
 * 接收 FormData 中的 image 字段，保存文件后更新用户 avatarUrl。
 * 头像限定为图片格式（jpg/jpeg/png/gif/webp），最大 2MB。
 * 需要登录认证。
 * @deprecated M6: 此 API 路由已弃用，内部交互已迁移到 Astro Actions。保留供外部客户端使用。
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { saveFile, deleteFileRef } from '@/lib/upload';
import { successResponse, jsonErrorResponse } from '@/lib/utils';

/** 头像最大文件大小：2MB */
const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

/** 头像允许的图片扩展名 */
const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * 处理头像上传
 *
 * 流程：
 * 1. 验证登录状态
 * 2. 从 FormData 提取图片文件
 * 3. 校验文件类型和大小
 * 4. 调用 saveFile 保存文件
 * 5. 更新用户 avatarUrl（同时清理旧头像文件的引用计数）
 * 6. 返回新的头像 URL
 *
 * @param context - Astro API 上下文
 * @returns 头像 URL 或错误
 */
export const POST: APIRoute = async (context) => {
	try {
		// 1. 验证登录状态
		const authResult = await requireAuth(context);
		if (authResult instanceof Response) {
			return authResult;
		}
		const currentUser = authResult;

		// 2. 解析 FormData
		const formData = await context.request.formData();
		const file = formData.get('image') as File | null;

		if (!file) {
			return jsonErrorResponse('请选择要上传的头像图片');
		}

		// 3. 校验文件类型
		const ext = file.name.split('.').pop()?.toLowerCase() || '';
		if (!AVATAR_EXTENSIONS.includes(ext)) {
			return jsonErrorResponse(
				`不支持的文件类型: .${ext}，允许的类型: ${AVATAR_EXTENSIONS.join(', ')}`
			);
		}

		// 4. 校验文件大小
		if (file.size > AVATAR_MAX_SIZE) {
			return jsonErrorResponse('头像图片大小不能超过 2MB');
		}

		// 5. 保存文件
		const { fileStorage } = await saveFile(file, 'image');
		const newAvatarUrl = `/uploads/${fileStorage.filePath}`;

		// 6. 获取旧头像 URL，更新用户记录
		const user = await prisma.user.findUnique({
			where: { id: currentUser.userId },
			select: { avatarUrl: true }
		});

		const updatedUser = await prisma.user.update({
			where: { id: currentUser.userId },
			data: { avatarUrl: newAvatarUrl },
			select: { avatarUrl: true }
		});

		// 7. 清理旧头像文件的引用计数（仅清理本站上传的头像）
		if (user?.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
			const oldFilePath = user.avatarUrl.replace('/uploads/', '');
			try {
				const oldFile = await prisma.fileStorage.findUnique({
					where: { filePath: oldFilePath }
				});
				if (oldFile) {
					await deleteFileRef(oldFile.id);
				}
			} catch (err) {
				// 旧文件清理失败不影响主流程
				console.error('清理旧头像文件引用失败:', err);
			}
		}

		return new Response(JSON.stringify(successResponse(updatedUser)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : '上传失败';
		const isBusinessError =
			message.includes('不支持的文件类型') || message.includes('文件大小超过限制');

		if (isBusinessError) {
			return jsonErrorResponse(message);
		}

		console.error('头像上传失败:', error);
		return jsonErrorResponse('服务器错误', 500);
	}
};
