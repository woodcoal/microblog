/**
 * robots.txt 动态生成
 *
 * 根据站点配置动态生成 robots.txt 文件，
 * Sitemap URL 使用 SITE_URL 环境变量，避免硬编码端口。
 */
import type { APIRoute } from 'astro';
import { SITE_URL } from '@/lib/config';

/**
 * GET 请求处理函数
 *
 * 生成 robots.txt 内容，包含：
 * - 允许所有爬虫抓取公开页面
 * - 禁止抓取 API、管理后台、设置等私有路径
 * - 动态生成 Sitemap URL（使用 SITE_URL 环境变量）
 *
 * @returns Response - text/plain 格式的 robots.txt 响应
 */
export const GET: APIRoute = async () => {
	const siteUrl = SITE_URL;
	const content = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /settings/
Disallow: /following
Disallow: /followers
Disallow: /notifications
Disallow: /bookmarks
Disallow: /search
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email
Disallow: /change-email
Disallow: /*/edit
Disallow: /*/revisions

Sitemap: ${siteUrl}/sitemap.xml`;

	return new Response(content, {
		headers: { 'Content-Type': 'text/plain' }
	});
};
