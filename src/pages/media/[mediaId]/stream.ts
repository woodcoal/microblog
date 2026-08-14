import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { readStoredFile, toResponseBody } from '@/lib/media-file';
import { getVisibleMedia } from '@/services/media-access.service';

export const prerender = false;
const notFound = () => new Response('Not Found', { status: 404 });
function rangeFor(
	header: string | null,
	length: number
): { start: number; end: number } | null | 'invalid' {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return 'invalid';
	const [, from, to] = match;
	if (!from && !to) return 'invalid';
	let start: number;
	let end: number;
	if (!from) {
		const suffix = Number(to);
		if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid';
		start = Math.max(0, length - suffix);
		end = length - 1;
	} else {
		start = Number(from);
		end = to ? Number(to) : length - 1;
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start < 0 ||
			start > end ||
			start >= length
		)
			return 'invalid';
		end = Math.min(end, length - 1);
	}
	return { start, end };
}
async function handle(context: Parameters<APIRoute>[0], head: boolean) {
	const mediaId = context.params.mediaId;
	const media = mediaId
		? await getVisibleMedia(
				mediaId,
				await getUserFromRequest(context),
				undefined,
				context.request
			)
		: null;
	if (!media || media.fileType !== 'video') return notFound();
	const body = await readStoredFile(media.fileStorage.filePath);
	if (!body) return notFound();
	const range = rangeFor(context.request.headers.get('range'), body.byteLength);
	const headers = new Headers({
		'Content-Type': 'video/mp4',
		'Accept-Ranges': 'bytes',
		'X-Content-Type-Options': 'nosniff',
		'Cache-Control': 'private, no-store'
	});
	if (range === 'invalid') {
		headers.set('Content-Range', `bytes */${body.byteLength}`);
		return new Response(null, { status: 416, headers });
	}
	if (!range) {
		headers.set('Content-Length', String(body.byteLength));
		return new Response(head ? null : toResponseBody(body), { headers });
	}
	const part = body.subarray(range.start, range.end + 1);
	headers.set('Content-Length', String(part.byteLength));
	headers.set('Content-Range', `bytes ${range.start}-${range.end}/${body.byteLength}`);
	return new Response(head ? null : toResponseBody(part), { status: 206, headers });
}
export const GET: APIRoute = (context) => handle(context, false);
export const HEAD: APIRoute = (context) => handle(context, true);
