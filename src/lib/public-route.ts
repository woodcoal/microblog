/** Public-route responses shared by SSR pages whose content has permanently left the site. */

/**
 * A deliberately identity-free 410 response. `X-Robots-Tag` reaches crawlers even when they do
 * not parse an HTML document, while the empty body prevents a cached username or avatar leaking.
 */
export function goneResponse(): Response {
	return new Response(null, {
		status: 410,
		statusText: 'Gone',
		headers: {
			'Cache-Control': 'no-store',
			'X-Robots-Tag': 'noindex, nofollow, noarchive'
		}
	});
}
