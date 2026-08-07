import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.MUTAN_E2E_BASE_URL;
const viewports = [375, 767, 768, 1023, 1024, 1499, 1500, 1600];

test(
	'搜索页在关键视口不产生页面级横向滚动',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		const { default: puppeteer } = await import('puppeteer');
		const browser = await puppeteer.launch({ headless: true });

		try {
			const page = await browser.newPage();
			for (const width of viewports) {
				await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
				await page.goto(`${baseUrl}/search`, { waitUntil: 'networkidle0' });

				const metrics = await page.evaluate(() => ({
					scrollWidth: document.documentElement.scrollWidth,
					clientWidth: document.documentElement.clientWidth,
					shellCount: document.querySelectorAll('.channel-shell--single').length
				}));

				assert.equal(metrics.shellCount, 1, `${width}px 应保留一个 single 共享壳`);
				assert.ok(
					metrics.scrollWidth <= metrics.clientWidth,
					`${width}px 不应出现页面级横向滚动 (${metrics.scrollWidth}/${metrics.clientWidth})`
				);
			}
		} finally {
			await browser.close();
		}
	}
);
