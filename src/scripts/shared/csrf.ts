/** 为同源不安全请求附加 SSR 注入的同步器 CSRF 令牌。 */
const tokenMeta = document.querySelector('meta[name="csrf-token"]');
const token = tokenMeta?.getAttribute('content');

if (token) {
	const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
	const originalFetch = window.fetch.bind(window);

	window.fetch = (input, init) => {
		const request = input instanceof Request ? input : null;
		const targetUrl = new URL(request ? request.url : String(input), window.location.href);
		const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
		if (targetUrl.origin !== window.location.origin || !unsafeMethods.has(method)) {
			return originalFetch(input, init);
		}

		const headers = new Headers(request?.headers);
		if (init?.headers) {
			new Headers(init.headers).forEach((value, key) => headers.set(key, value));
		}
		if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
		return originalFetch(input, { ...init, headers });
	};

	document.addEventListener('submit', (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement) || !unsafeMethods.has(form.method.toUpperCase()))
			return;
		const action = new URL(
			form.getAttribute('action') ?? window.location.href,
			window.location.href
		);
		if (
			action.origin !== window.location.origin ||
			form.querySelector('input[name="csrf_token"]')
		)
			return;

		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = 'csrf_token';
		input.value = token;
		form.append(input);
	});
}
