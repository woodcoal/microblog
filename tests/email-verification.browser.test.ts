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

			const email = `browser-enum-${Date.now()}@example.test`;
			async function submitRegistration() {
				await page.$eval(
					'#email',
					(input, value) => ((input as HTMLInputElement).value = value),
					email
				);
				await page.$eval(
					'#displayName',
					(input) => ((input as HTMLInputElement).value = 'Browser enum test')
				);
				await page.$eval(
					'#password',
					(input) => ((input as HTMLInputElement).value = 'browser-enum-password')
				);
				await page.$eval(
					'#confirmPassword',
					(input) => ((input as HTMLInputElement).value = 'browser-enum-password')
				);
				await page.click('#register-form button[type="submit"]');
				await page.waitForSelector('#registration-success:not([hidden])');
				return page.$eval('#registration-success', (panel) => panel.textContent?.trim());
			}

			const newEmailMessage = await submitRegistration();
			await page.$eval(
				'#registration-success',
				(panel) => ((panel as HTMLElement).hidden = true)
			);
			const existingEmailMessage = await submitRegistration();
			assert.equal(existingEmailMessage, newEmailMessage);
		} finally {
			await browser.close();
		}
	}
);
