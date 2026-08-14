/** src/pages/forgot-password.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const form = document.getElementById('forgot-password-form') as HTMLFormElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const submitButton = document.getElementById('forgot-password-submit') as HTMLButtonElement;
const accepted = document.getElementById('forgot-password-accepted') as HTMLElement;
const status = document.getElementById('forgot-password-status') as HTMLElement;

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	const email = emailInput.value.trim();
	status.textContent = '';
	if (!email) {
		status.textContent = '请输入邮箱地址。';
		emailInput.focus();
		return;
	}

	submitButton.disabled = true;
	submitButton.textContent = '提交中…';
	try {
		const result = await actions.forgotPassword({ email });
		if (result.error) {
			status.textContent = result.error.message || '暂时无法提交请求，请稍后再试。';
			return;
		}
		form.hidden = true;
		accepted.hidden = false;
		accepted.focus();
	} catch {
		status.textContent = '网络连接异常，请检查后重试。';
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = '发送重置链接';
	}
});
