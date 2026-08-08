import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.MUTAN_E2E_BASE_URL;
const author = 'qa-author';
const details = [
	{ id: 'qaweibo1', marker: 'QA_WEIBO_BODY' },
	{ id: 'qaforum1', marker: 'QA_FORUM_BODY' },
	{ id: 'qablog001', marker: 'QA_BLOG_BODY' }
];

async function withBrowser(run: (page: import('puppeteer').Page) => Promise<void>) {
	const { default: puppeteer } = await import('puppeteer');
	const browser = await puppeteer.launch({ headless: true });
	try {
		await run(await browser.newPage());
	} finally {
		await browser.close();
	}
}

async function pageMetrics(page: import('puppeteer').Page) {
	return page.evaluate(() => {
		const main = document.querySelector<HTMLElement>('.channel-shell__main');
		const aside = document.querySelector<HTMLElement>('.channel-shell__aside');
		const shell = document.querySelector<HTMLElement>('.channel-shell');
		const detail = document.querySelector<HTMLElement>('.post-detail-layout');
		return {
			scrollWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth,
			shellCount: document.querySelectorAll('.channel-shell').length,
			mainWidth: main?.getBoundingClientRect().width ?? 0,
			asideDisplay: aside ? getComputedStyle(aside).display : 'absent',
			gridTemplateColumns: shell ? getComputedStyle(shell).gridTemplateColumns : '',
			detailDisplay: detail ? getComputedStyle(detail).display : 'absent',
			detailWidth: detail?.getBoundingClientRect().width ?? 0
		};
	});
}

const bodyText = (page: import('puppeteer').Page) => page.$eval('body', (body) => body.innerText);

test(
	'三种频道列表与详情在关键断点使用共享壳且没有页面级横向滚动',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		await withBrowser(async (page) => {
			for (const path of ['/weibo', '/forum', '/blog']) {
				for (const width of [768, 1024, 1500, 1600]) {
					await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
					await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle0' });
					const metrics = await pageMetrics(page);
					assert.equal(metrics.shellCount, 1, `${path} @ ${width}px 应仅渲染一个共享壳`);
					assert.ok(
						metrics.scrollWidth <= metrics.clientWidth,
						`${path} @ ${width}px 不应产生页面级横向滚动 (${metrics.scrollWidth}/${metrics.clientWidth})`
					);
					if (width === 768) {
						assert.match(
							metrics.gridTemplateColumns,
							/^100px /,
							`${path} 应使用 100px tablet 导航`
						);
						assert.equal(metrics.asideDisplay, 'none', `${path} @ 768px 应收起右栏`);
					}
					if (width === 1024) {
						assert.match(
							metrics.gridTemplateColumns,
							/^200px /,
							`${path} 应恢复 200px 导航`
						);
						assert.equal(metrics.asideDisplay, 'none', `${path} @ 1024px 应收起右栏`);
					}
					if (width >= 1500) {
						assert.match(
							metrics.gridTemplateColumns,
							/^200px .+ 300px$/,
							`${path} 应使用桌面三栏`
						);
						assert.equal(
							metrics.asideDisplay,
							'block',
							`${path} @ ${width}px 应展示真实右栏`
						);
						assert.ok(
							metrics.mainWidth > 760,
							`${path} 中列应填满剩余宽度 (${metrics.mainWidth})`
						);
					}
				}
			}

			for (const width of [768, 1024, 1500, 1600]) {
				await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
				for (const detail of details) {
					const response = await page.goto(`${baseUrl}/${author}/${detail.id}`, {
						waitUntil: 'networkidle0'
					});
					assert.equal(response?.status(), 200, `${detail.id} 应可正常打开`);
					assert.match(await bodyText(page), new RegExp(detail.marker));
					if (detail.id === 'qablog001') {
						const thumbnailSrc = await page.$eval(
							'.post-detail-blog-thumbnail img',
							(image) => image.getAttribute('src')
						);
						const attachmentHref = await page.$eval('.post-detail-attachment', (link) =>
							link.getAttribute('href')
						);
						assert.match(thumbnailSrc || '', /^\/media\/[^/]+$/, '博客缩略图应使用受控媒体入口');
						assert.match(
							attachmentHref || '',
							/^\/media\/[^/]+\/download$/,
							'博客附件应使用受控下载入口'
						);
						assert.match(await bodyText(page), /qa-blog-guide\.pdf/);
					}
					const metrics = await pageMetrics(page);
					assert.equal(metrics.shellCount, 1, `${detail.id} 应仅渲染一个共享壳`);
					assert.equal(
						metrics.detailDisplay,
						'block',
						`${detail.id} 正文应保持单列内容流`
					);
					assert.ok(
						metrics.detailWidth >= metrics.mainWidth - 1,
						`${detail.id} 正文应填满中列`
					);
					assert.ok(
						metrics.scrollWidth <= metrics.clientWidth,
						`${detail.id} 不应横向溢出`
					);
					if (width < 1500) {
						assert.equal(
							metrics.asideDisplay,
							'none',
							`${detail.id} @ ${width}px 不应强制右栏`
						);
					}
					if (width >= 1500) {
						assert.match(
							metrics.gridTemplateColumns,
							/^200px .+ 300px$/,
							`${detail.id} 应使用三栏频道壳`
						);
						assert.equal(
							metrics.asideDisplay,
							'block',
							`${detail.id} @ ${width}px 应展示右栏`
						);
						assert.ok(
							metrics.mainWidth > 760,
							`${detail.id} 中列应填满剩余宽度 (${metrics.mainWidth})`
						);
					}
				}
			}
		});
	}
);

test(
	'详情页持久校验 SEO、论坛内容与异常契约',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		await withBrowser(async (page) => {
			const canonical = `${baseUrl}/${author}/qaforum1`;
			await page.goto(canonical, { waitUntil: 'networkidle0' });
			const seo = await page.evaluate(() => ({
				canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
				ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
				jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent
			}));
			assert.equal(seo.canonical, canonical);
			assert.equal(seo.ogUrl, canonical);
			assert.equal(JSON.parse(seo.jsonLd ?? '{}').url, canonical);
			const forumText = await bodyText(page);
			assert.match(forumText, /QA_FORUM_COMMENT/);
			assert.match(forumText, /qa-evidence\.txt/);

			await page.goto(`${baseUrl}/${author}/qapasswd1`, { waitUntil: 'networkidle0' });
			assert.match(await bodyText(page), /需要密码才能查看/);
			assert.doesNotMatch(await bodyText(page), /QA_PASSWORD_SECRET/);
			assert.equal(
				await page.$eval('meta[name="robots"]', (meta) => meta.getAttribute('content')),
				'noindex'
			);

			const unknown = await page.goto(`${baseUrl}/${author}/qaunknown`, {
				waitUntil: 'networkidle0'
			});
			assert.equal(unknown?.status(), 500);
			assert.doesNotMatch(await bodyText(page), /不能作为详情页降级展示/);

			const missing = await page.goto(`${baseUrl}/${author}/missing1`, {
				waitUntil: 'networkidle0'
			});
			assert.ok([302, 404].includes(missing?.status() ?? 0), '缺失帖子应进入 404 流程');
			assert.match(page.url(), /\/404$/);
		});
	}
);

test(
	'已认证通知页在 1024px 使用 single 壳且没有横向溢出',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		await withBrowser(async (page) => {
			await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
			await page.goto(`${baseUrl}/login?redirect=/notifications`, {
				waitUntil: 'networkidle0'
			});
			await page.locator('#email').fill('qa-viewer@example.test');
			await page.locator('#password').fill('qa-browser-password');
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle0' }),
				page.locator('#submit-btn').click()
			]);
			assert.match(page.url(), /\/notifications$/);
			assert.match(await bodyText(page), /QA 作者/);
			const metrics = await pageMetrics(page);
			assert.equal(metrics.shellCount, 1);
			assert.equal(await page.$$eval('.channel-shell--single', (shells) => shells.length), 1);
			assert.ok(metrics.scrollWidth <= metrics.clientWidth, '通知页不应横向溢出');
		});
	}
);
