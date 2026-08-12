import { SITE_URL } from '@/lib/config';

/** Pages whose content is specific to a signed-in visitor or a transient query. */
export function isNonIndexablePath(pathname: string): boolean {
	return (
		pathname === '/search' ||
		pathname === '/bookmarks' ||
		pathname === '/following' ||
		pathname === '/followers' ||
		pathname === '/notifications' ||
		pathname === '/settings' ||
		pathname.startsWith('/settings/') ||
		pathname === '/admin' ||
		pathname.startsWith('/admin/') ||
		pathname === '/blog/write' ||
		pathname.endsWith('/edit') ||
		pathname.endsWith('/revisions')
	);
}

/** A public, query-free static route can use this as its canonical URL. */
export function getStaticCanonicalUrl(pathname: string, hasSearch: boolean): string | undefined {
	if (hasSearch || isNonIndexablePath(pathname)) return undefined;
	return new URL(pathname, SITE_URL).toString();
}

/** A deleted account is deliberately represented without a page body or identity-bearing metadata. */
export function goneResponse(): Response {
	return new Response('资源已永久下线', {
		status: 410,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Robots-Tag': 'noindex, nofollow, noarchive'
		}
	});
}

/** Sitemap XML must not interpolate configuration or route data without escaping. */
export function escapeXml(value: string): string {
	return value.replace(/[<>&'"]/g, (character) => {
		switch (character) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case "'":
				return '&apos;';
			case '"':
				return '&quot;';
			default:
				return character;
		}
	});
}
