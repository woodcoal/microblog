import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { readStoredFile, toResponseBody } from '@/lib/media-file';

export const prerender = false;

const notFound = () => new Response('Not Found', { status: 404 });

/**
 * 返回当前仍被用户作为头像引用的图片展示副本。
 *
 * @param context - Astro API 路由上下文，路径参数为 FileStorage ID
 * @param head - 是否仅返回响应头
 * @returns 公开缓存的头像图片，或 404
 */
async function handle(context: Parameters<APIRoute>[0], head: boolean): Promise<Response> {
	const fileStorageId = context.params.fileStorageId;
	if (!fileStorageId) return notFound();

	const avatar = await prisma.user.findFirst({
		where: { avatarUrl: `/media/avatars/${fileStorageId}`, deletedAt: null, isDisabled: false },
		select: { id: true }
	});
	if (!avatar) return notFound();

	const fileStorage = await prisma.fileStorage.findUnique({ where: { id: fileStorageId } });
	if (!fileStorage || fileStorage.fileType !== 'image') return notFound();
	const body = await readStoredFile(fileStorage.displayFilePath || fileStorage.filePath);
	if (!body) return notFound();

	return new Response(head ? null : toResponseBody(body), {
		headers: {
			'Content-Type': fileStorage.displayMimeType || fileStorage.mimeType,
			'Content-Length': String(body.byteLength),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'public, max-age=86400'
		}
	});
}

export const GET: APIRoute = (context) => handle(context, false);
export const HEAD: APIRoute = (context) => handle(context, true);
