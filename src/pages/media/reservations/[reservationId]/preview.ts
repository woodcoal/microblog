import type { APIRoute } from 'astro';
import { getUserFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { contentDisposition, readStoredFile, toResponseBody } from '@/lib/media-file';

export const prerender = false;

const notFound = () => new Response('Not Found', { status: 404 });

export const GET: APIRoute = async (context) => {
	const currentUser = await getUserFromRequest(context);
	if (!currentUser) return notFound();
	const reservation = await prisma.uploadReservation.findFirst({
		where: {
			id: context.params.reservationId,
			userId: currentUser.userId,
			cancelledAt: null,
			OR: [{ consumedAt: { not: null } }, { expiresAt: { gt: new Date() } }]
		},
		include: { fileStorage: true }
	});
	if (!reservation) return notFound();
	const body = await readStoredFile(reservation.fileStorage.filePath);
	if (!body) return notFound();
	return new Response(toResponseBody(body), {
		headers: {
			'Content-Type': reservation.fileStorage.mimeType,
			'Content-Length': String(body.byteLength),
			'Content-Disposition':
				reservation.fileType === 'attachment'
					? contentDisposition(reservation.originalName)
					: 'inline',
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
};
