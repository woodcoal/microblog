import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { readStoredFile, toResponseBody } from '@/lib/media-file';
import { getVisibleMedia } from '@/services/media-access.service';

export const prerender = false;
const notFound = () => new Response('Not Found', { status: 404 });
async function handle(context: Parameters<APIRoute>[0], head: boolean) {
	const mediaId = context.params.mediaId;
	const media = mediaId ? await getVisibleMedia(mediaId, await getUserFromRequest(context)) : null;
	if (!media || media.fileType !== 'image') return notFound();
	const body = await readStoredFile(media.fileStorage.displayFilePath || media.fileStorage.filePath);
	if (!body) return notFound();
	return new Response(head ? null : toResponseBody(body), { headers: {
		'Content-Type': media.fileStorage.displayMimeType || media.fileStorage.mimeType,
		'Content-Length': String(body.byteLength), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
	} });
}
export const GET: APIRoute = (context) => handle(context, false);
export const HEAD: APIRoute = (context) => handle(context, true);
