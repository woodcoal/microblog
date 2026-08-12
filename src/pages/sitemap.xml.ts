/**
 * Sitemap 动态生成页面
 *
 * 根据数据库中的公开帖子和活跃用户，动态生成 sitemap.xml。
 * 搜索引擎爬虫通过此文件发现站点所有可索引页面。
 *
 * 包含的 URL 类型：
 * - 首页（最高优先级）
 * - 最新页（高频更新）
 * - 用户主页
 * - 帖子详情页
 */
import type { APIRoute } from 'astro';
import { prisma } from '@/lib/db';
import { SITE_MODES, SITE_URL } from '@/lib/config';
import { escapeXml } from '@/lib/site-seo';

/**
 * GET 请求处理函数
 *
 * 查询数据库获取所有公开帖子和活跃用户，
 * 生成符合 sitemap 协议的 XML 响应。
 *
 * @returns Response - application/xml 格式的 sitemap 响应
 */
export const GET: APIRoute = async () => {
	// 查询所有公开且未删除的帖子，用于生成帖子详情页 URL
	const posts = await prisma.post.findMany({
		where: { visibility: 'public', isDeleted: false, user: { deletedAt: null } },
		select: {
			id: true,
			userId: true,
			updatedAt: true,
			user: { select: { username: true } }
		}
	});

	// 查询所有未禁用的用户，排除 admin 用户，用于生成用户主页 URL
	const users = await prisma.user.findMany({
		where: { isDisabled: false, deletedAt: null, username: { not: 'admin' } },
		select: { username: true, updatedAt: true }
	});

	// 收集所有 URL 条目
	const urls: Array<{
		loc: string;
		changefreq: 'always' | 'daily' | 'weekly';
		priority: string;
		lastmod?: string;
	}> = [];

	// 首页 - 最高优先级，每日更新
	urls.push({ loc: SITE_URL, changefreq: 'daily', priority: '1.0' });

	// 最新页 - 持续更新，较高优先级
	urls.push({
		loc: `${SITE_URL}/latest`,
		changefreq: 'always',
		priority: '0.8'
	});

	// 仅加入无查询参数、可公开访问的频道入口；私有入口和搜索不会进入 sitemap。
	for (const mode of SITE_MODES) {
		urls.push({
			loc: `${SITE_URL}/${mode}`,
			changefreq: 'daily',
			priority: '0.8'
		});
	}

	// 用户主页 - 每日更新
	for (const user of users) {
		urls.push({
			loc: `${SITE_URL}/${user.username}`,
			changefreq: 'daily',
			priority: '0.7',
			lastmod: user.updatedAt.toISOString().split('T')[0]
		});
	}

	// 帖子详情页 - 每周更新
	for (const post of posts) {
		urls.push({
			loc: `${SITE_URL}/${post.user.username}/${post.id}`,
			changefreq: 'weekly',
			priority: '0.6',
			lastmod: post.updatedAt.toISOString().split('T')[0]
		});
	}

	// 生成 sitemap XML 文档
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml' }
	});
};
