import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.MUTAN_E2E_BASE_URL;

async function chooseFile(
	page: import('puppeteer').Page,
	selector: string,
	name: string,
	type: string,
	bytes: number[]
) {
	await page.$eval(
		selector,
		(input, file) => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File([new Uint8Array(file.bytes)], file.name, { type: file.type })
			);
			Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
		{ name, type, bytes }
	);
}

test(
	'图片上传未完成时选择视频不会发起第二次上传，提交仅携带图片 mediaIds',
	{ skip: !baseUrl && '需要运行中的站点，请设置 MUTAN_E2E_BASE_URL' },
	async () => {
		const { default: puppeteer } = await import('puppeteer');
		const browser = await puppeteer.launch({ headless: true });
		let heldImageRequest: import('puppeteer').HTTPRequest | undefined;
		let resolveImageUploadStarted: (() => void) | undefined;
		const imageUploadStarted = new Promise<void>((resolve) => {
			resolveImageUploadStarted = resolve;
		});
		let uploadRequests = 0;

		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				const pathname = new URL(request.url()).pathname;
				if (pathname === '/api/upload') {
					uploadRequests += 1;
					if (uploadRequests === 1) {
						heldImageRequest = request;
						resolveImageUploadStarted?.();
						return;
					}
				}
				void request.continue();
			});

			await page.goto(`${baseUrl}/login?redirect=/weibo`, { waitUntil: 'networkidle0' });
			await page.locator('#email').fill('qa-viewer@example.test');
			await page.locator('#password').fill('qa-browser-password');
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle0' }),
				page.locator('#submit-btn').click()
			]);
			await page.evaluate(() =>
				document.dispatchEvent(new CustomEvent('open-compose-modal'))
			);
			await page.waitForSelector('.post-editor');
			await page.$eval('#post-content', (textarea) => {
				(textarea as HTMLTextAreaElement).value = '并发媒体上传回归';
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			});

			await chooseFile(
				page,
				'#file-input',
				'pending.png',
				'image/png',
				[
					137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
					0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 29, 99,
					248, 207, 192, 240, 31, 0, 5, 128, 2, 63, 73, 194, 240, 47, 0, 0, 0, 0, 73, 69,
					78, 68, 174, 66, 96, 130
				]
			);
			await imageUploadStarted;
			await chooseFile(page, '#video-input', 'blocked.mp4', 'video/mp4', [0, 0, 0, 24]);

			await page.waitForFunction(() =>
				document.querySelector('#form-error')?.textContent?.includes('已选择图片')
			);
			assert.equal(uploadRequests, 1, '视频选择不得发起第二类上传');
			assert.equal(
				await page.$eval('#submit-btn', (button) => (button as HTMLButtonElement).disabled),
				true,
				'首个上传未完成时不得提交'
			);

			await heldImageRequest?.continue();
			await page.waitForSelector('.post-editor-preview-item img');
			await page.waitForFunction(
				() => !(document.querySelector('#submit-btn') as HTMLButtonElement).disabled
			);
			const createPostRequest = page.waitForRequest(
				(request) => new URL(request.url()).pathname === '/_actions/createPost'
			);
			await page.locator('#submit-btn').click();
			const request = await createPostRequest;
			const body = JSON.parse(request.postData() || '{}') as { mediaIds?: string[] };
			assert.equal(body.mediaIds?.length, 1, '提交的 mediaIds 不得混入视频');
		} finally {
			await browser.close();
		}
	}
);
