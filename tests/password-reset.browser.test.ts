import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.MUTAN_E2E_BASE_URL;

test(
	'找回和重置密码页面在移动端提供安全的浏览器交互',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		const { default: puppeteer } = await import('puppeteer');
		const browser = await puppeteer.launch({ headless: true });

		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });

			await page.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle0' });
			assert.equal((await page.$$('#forgot-password-form')).length, 1);
			assert.match(await page.$eval('body', (body) => body.innerText), /找回密码/);
			const forgotMetrics = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				clientWidth: document.documentElement.clientWidth
			}));
			assert.ok(forgotMetrics.scrollWidth <= forgotMetrics.clientWidth);

			await page.goto(`${baseUrl}/reset-password`, { waitUntil: 'networkidle0' });
			await page.waitForSelector('#reset-password-action:not([hidden])');
			assert.match(
				await page.$eval('body', (body) => body.innerText),
				/请从重置邮件中打开完整链接/
			);
			assert.equal(
				await page.evaluate(() => document.activeElement?.id),
				'reset-password-action'
			);

			await page.goto(`${baseUrl}/reset-password?token=browser-test-token`, {
				waitUntil: 'networkidle0'
			});
			await page.waitForSelector('#reset-password-form:not([hidden])');
			await page.$eval(
				'#password',
				(input) => ((input as HTMLInputElement).value = 'browser-reset-password')
			);
			await page.$eval(
				'#confirm-password',
				(input) => ((input as HTMLInputElement).value = 'different-password')
			);
			await page.click('#reset-password-submit');
			assert.match(
				await page.$eval('#reset-password-status', (element) => element.textContent ?? ''),
				/两次输入的新密码不一致/
			);
		} finally {
			await browser.close();
		}
	}
);
