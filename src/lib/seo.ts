/** 公开页面 SEO 的唯一 URL 与索引策略。 */
import { SITE_URL } from '@/lib/config';

const privatePathPrefixes = [
	'/admin',
	'/api',
	'/settings',
	'/bookmarks',
	'/following',
	'/followers',
	'/notifications',
	'/search',
	'/login',
	'/register',
	'/forgot-password',
	'/reset-password',
	'/verify-email',
	'/change-email'
] as const;

/**
 * 生成不带查询参数或片段的绝对 canonical URL。页面、Open Graph、JSON-LD 和 sitemap
 * 都必须复用它，避免同一内容生成不同 URL。
 */
export function getCanonicalUrl(pathname: string): string {
	const url = new URL(pathname, SITE_URL);
	url.search = '';
	url.hash = '';
	return url.toString();
}

/** 非公开页面、以及筛选/分页等非主版本 URL 都不应成为搜索入口。 */
export function shouldNoindexPage(pathname: string, hasSearchParams = false): boolean {
	return hasSearchParams || privatePathPrefixes.some((prefix) => pathname.startsWith(prefix));
}

/** 已注销账号或已删除内容不渲染身份资料，并给爬虫明确的永久下线语义。 */
export function createGoneResponse(): Response {
	return new Response('内容已永久下线', {
		status: 410,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Robots-Tag': 'noindex, nofollow'
		}
	});
}
