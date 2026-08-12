import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.MUTAN_E2E_BASE_URL;

test(
	'邮箱验证落地页和注册页提供可用的验证引导',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		const { default: puppeteer } = await import('puppeteer');
		const browser = await puppeteer.launch({ headless: true });

		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
			await page.goto(`${baseUrl}/verify-email`, { waitUntil: 'networkidle0' });
			await page.waitForSelector('#verification-action:not([hidden])');
			assert.match(
				await page.$eval('body', (body) => body.innerText),
				/请从验证邮件中打开链接/
			);
			assert.equal(
				await page.$eval('#resend-form button', (button) => button.textContent),
				'重新发送'
			);

			const verifyMetrics = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				clientWidth: document.documentElement.clientWidth
			}));
			assert.ok(
				verifyMetrics.scrollWidth <= verifyMetrics.clientWidth,
				'验证页在移动端不应产生页面级横向滚动'
			);

			await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle0' });
			assert.equal((await page.$$('#register-form')).length, 1);
			assert.equal((await page.$$('#registration-success')).length, 1);
		} finally {
			await browser.close();
		}
	}
);
