/** 页面展示面分类，统一决定全局页脚与统计脚本的输出范围。 */
export type PageSurface = 'public' | 'identity' | 'private';

const IDENTITY_PATHS = new Set([
	'/login',
	'/register',
	'/forgot-password',
	'/reset-password',
	'/verify-email',
	'/change-email'
]);

const PRIVATE_PREFIXES = [
	'/admin',
	'/api',
	'/settings',
	'/bookmarks',
	'/followers',
	'/following',
	'/notifications',
	'/search',
	'/blog/write'
];

export function getPageSurface(pathname: string): PageSurface {
	if (IDENTITY_PATHS.has(pathname)) return 'identity';
	if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))
		return 'private';
	if (/\/(?:edit|revisions)$/.test(pathname)) return 'private';
	return 'public';
}
