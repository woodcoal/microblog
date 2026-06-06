/**
 * 剪贴板粘贴图片功能测试脚本（v3）
 *
 * 核心策略：直接在页面内用 JavaScript 模拟粘贴事件，
 * 不依赖 Puppeteer 的 DOM 点击操作，避免按钮不可点击的问题。
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:4322';

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	console.log('=== 剪贴板粘贴图片功能测试 v3 ===\n');

	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 800 });

	// 收集网络请求
	const uploadRequests = [];
	page.on('response', (response) => {
		const url = response.url();
		if (url.includes('/api/upload') || url.includes('/_actions/uploadMedia')) {
			uploadRequests.push({ url, status: response.status() });
			console.log(`[网络] ${response.status()} ${url}`);
		}
	});

	page.on('requestfailed', (request) => {
		const url = request.url();
		if (url.includes('/api/upload') || url.includes('/_actions/uploadMedia')) {
			console.log(`[请求失败] ${url} - ${request.failure()?.errorText}`);
		}
	});

	const consoleErrors = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});

	try {
		// ===== 1. 登录 =====
		console.log('1. 登录...');
		await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
		await delay(1000);

		// 使用 evaluate 直接操作 DOM 登录
		await page.evaluate(() => {
			const emailInput = document.querySelector(
				'input[type="email"], input[name="email"], input[placeholder*="邮箱"]'
			);
			const passwordInput = document.querySelector('input[type="password"]');
			if (emailInput) {
				emailInput.value = 'test@test.com';
				emailInput.dispatchEvent(new Event('input', { bubbles: true }));
			}
			if (passwordInput) {
				passwordInput.value = 'test1234';
				passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});
		await delay(500);

		// 点击提交
		await page.evaluate(() => {
			const btn = document.querySelector('button[type="submit"]');
			if (btn) btn.click();
		});
		await delay(3000);
		console.log(`   当前页面: ${page.url()}`);

		// ===== 2. 直接测试 /api/upload 端点 =====
		console.log('\n2. 直接测试 /api/upload 端点...');
		const directResult = await page.evaluate(async () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = 10;
				canvas.height = 10;
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = 'red';
				ctx.fillRect(0, 0, 10, 10);

				const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
				const file = new File([blob], 'test-direct.png', { type: 'image/png' });

				const formData = new FormData();
				formData.append('file', file);
				formData.append('fileType', 'image');

				const res = await fetch('/api/upload', {
					method: 'POST',
					body: formData
				});

				const text = await res.text();
				let json;
				try {
					json = JSON.parse(text);
				} catch {
					return { status: res.status, parseError: true, raw: text.substring(0, 300) };
				}

				return {
					status: res.status,
					success: json.success,
					url: json.data?.url || null,
					hasBackslash: (json.data?.url || '').includes('\\')
				};
			} catch (err) {
				return { error: err.message };
			}
		});
		console.log(`   结果: ${JSON.stringify(directResult, null, 2)}`);
		const apiOk = directResult.success === true;

		// ===== 3. 测试微博编辑器粘贴图片 =====
		console.log('\n3. 测试微博编辑器...');
		await page.goto(`${BASE_URL}/weibo`, { waitUntil: 'networkidle2' });
		await delay(2000);

		// 用 evaluate 点击发布按钮
		await page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll('button'));
			const publishBtn = btns.find((b) => {
				const t = b.textContent?.trim() || '';
				return t === '发布' || t === '写微博';
			});
			if (publishBtn) {
				publishBtn.click();
			}
		});
		await delay(2000);

		// 模拟粘贴图片到微博 textarea
		const weiboResult = await page.evaluate(async () => {
			const textarea =
				document.querySelector('#post-content') ||
				document.querySelector('.post-editor-textarea');
			if (!textarea) return { found: false };

			// 创建图片
			const canvas = document.createElement('canvas');
			canvas.width = 10;
			canvas.height = 10;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = 'red';
			ctx.fillRect(0, 0, 10, 10);

			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
			const file = new File([blob], 'test-weibo.png', { type: 'image/png' });

			const clipboardData = new DataTransfer();
			clipboardData.items.add(file);

			const pasteEvent = new ClipboardEvent('paste', {
				bubbles: true,
				cancelable: true,
				clipboardData: clipboardData
			});

			textarea.focus();
			textarea.dispatchEvent(pasteEvent);
			return { found: true, dispatched: true };
		});
		console.log(`   粘贴事件: ${JSON.stringify(weiboResult)}`);

		await delay(5000);

		const weiboCheck = await page.evaluate(() => {
			const previews = document.querySelectorAll('.post-editor-preview-item img');
			const uploadCount = document.querySelector('#upload-count');
			return {
				previewCount: previews.length,
				uploadCount: uploadCount?.textContent || 'N/A',
				srcs: Array.from(previews)
					.map((img) => img.src)
					.slice(0, 3)
			};
		});
		console.log(`   微博结果: ${JSON.stringify(weiboCheck)}`);

		// ===== 4. 测试论坛编辑器粘贴图片 =====
		console.log('\n4. 测试论坛编辑器...');
		await page.goto(`${BASE_URL}/forum`, { waitUntil: 'networkidle2' });
		await delay(2000);

		// 用 evaluate 点击发帖按钮
		await page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll('button, a'));
			const postBtn = btns.find((b) => {
				const t = b.textContent?.trim() || '';
				return t === '发帖' || t === '新帖';
			});
			if (postBtn) postBtn.click();
		});
		await delay(2000);

		// 模拟粘贴图片到论坛 textarea
		const forumResult = await page.evaluate(async () => {
			const textarea = document.querySelector('.forum-editor-textarea');
			if (!textarea) return { found: false };

			const canvas = document.createElement('canvas');
			canvas.width = 10;
			canvas.height = 10;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = 'blue';
			ctx.fillRect(0, 0, 10, 10);

			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
			const file = new File([blob], 'test-forum.png', { type: 'image/png' });

			const clipboardData = new DataTransfer();
			clipboardData.items.add(file);

			const pasteEvent = new ClipboardEvent('paste', {
				bubbles: true,
				cancelable: true,
				clipboardData: clipboardData
			});

			textarea.focus();
			textarea.dispatchEvent(pasteEvent);
			return { found: true, dispatched: true };
		});
		console.log(`   粘贴事件: ${JSON.stringify(forumResult)}`);

		await delay(5000);

		const forumCheck = await page.evaluate(() => {
			const textarea = document.querySelector('.forum-editor-textarea');
			const value = textarea?.value || '';
			return {
				length: value.length,
				hasImageMd: value.includes('!['),
				hasUploadUrl: value.includes('/uploads/'),
				hasBackslash: value.includes('\\'),
				preview: value.substring(0, 200)
			};
		});
		console.log(`   论坛结果: ${JSON.stringify(forumCheck, null, 2)}`);

		// ===== 5. 测试博客编辑器粘贴图片 =====
		console.log('\n5. 测试博客编辑器...');
		await page.goto(`${BASE_URL}/blog/write`, { waitUntil: 'networkidle2' });
		await delay(4000);

		// 模拟粘贴图片到 Tiptap 编辑器
		const blogResult = await page.evaluate(async () => {
			const editorEl =
				document.querySelector('.tiptap') ||
				document.querySelector('.ProseMirror') ||
				document.querySelector('.blog-editor-content');
			if (!editorEl) return { found: false };

			const canvas = document.createElement('canvas');
			canvas.width = 10;
			canvas.height = 10;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = 'green';
			ctx.fillRect(0, 0, 10, 10);

			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
			const file = new File([blob], 'test-blog.png', { type: 'image/png' });

			const clipboardData = new DataTransfer();
			clipboardData.items.add(file);

			const pasteEvent = new ClipboardEvent('paste', {
				bubbles: true,
				cancelable: true,
				clipboardData: clipboardData
			});

			editorEl.focus();
			editorEl.dispatchEvent(pasteEvent);
			return { found: true, dispatched: true };
		});
		console.log(`   粘贴事件: ${JSON.stringify(blogResult)}`);

		await delay(5000);

		const blogCheck = await page.evaluate(() => {
			const editorEl =
				document.querySelector('.tiptap') ||
				document.querySelector('.ProseMirror') ||
				document.querySelector('.blog-editor-content');
			const images = editorEl ? editorEl.querySelectorAll('img') : [];
			return {
				imageCount: images.length,
				srcs: Array.from(images)
					.map((img) => img.src)
					.slice(0, 3),
				hasUploadUrl: Array.from(images).some((img) => img.src.includes('/uploads/')),
				hasBackslash: Array.from(images).some((img) => img.src.includes('\\'))
			};
		});
		console.log(`   博客结果: ${JSON.stringify(blogCheck)}`);

		// ===== 6. 汇总 =====
		console.log('\n=== 测试汇总 ===');
		console.log(`/api/upload 端点: ${apiOk ? '✅ 正常' : '❌ 异常'}`);
		console.log(`微博粘贴上传: ${weiboCheck.previewCount > 0 ? '✅ 成功' : '❌ 失败'}`);
		console.log(`论坛粘贴上传: ${forumCheck.hasUploadUrl ? '✅ 成功' : '❌ 失败'}`);
		console.log(`博客粘贴上传: ${blogCheck.hasUploadUrl ? '✅ 成功' : '❌ 失败'}`);
		console.log(`\n上传请求 (${uploadRequests.length} 条):`);
		uploadRequests.forEach((r) => console.log(`  ${r.status} ${r.url}`));

		const hasEndpointError = consoleErrors.some((e) =>
			e.includes('EndpointDidNotReturnAResponse')
		);
		console.log(`\nEndpointDidNotReturnAResponse: ${hasEndpointError ? '❌ 存在' : '✅ 无'}`);
	} catch (err) {
		console.error('测试出错:', err);
	} finally {
		await browser.close();
	}
}

main().catch(console.error);
