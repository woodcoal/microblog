/** src/pages/reset-password.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const page = document.querySelector('.password-reset-page') as HTMLElement;
const token = page.dataset.resetToken ?? '';
const form = document.getElementById('reset-password-form') as HTMLFormElement;
const action = document.getElementById('reset-password-action') as HTMLElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;
const submitButton = document.getElementById('reset-password-submit') as HTMLButtonElement;
const success = document.getElementById('reset-password-success') as HTMLElement;
const invalid = document.getElementById('reset-password-invalid') as HTMLElement;
const status = document.getElementById('reset-password-status') as HTMLElement;

function showState(state: HTMLElement) {
	[action, form, success, invalid].forEach((element) => (element.hidden = element !== state));
	state.focus();
}

if (!token) showState(action);
else form.hidden = false;

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	status.textContent = '';
	if (passwordInput.value !== confirmPasswordInput.value) {
		status.textContent = '两次输入的新密码不一致。';
		confirmPasswordInput.focus();
		return;
	}

	submitButton.disabled = true;
	submitButton.textContent = '保存中…';
	try {
		const result = await actions.confirmPasswordReset({
			token,
			password: passwordInput.value
		});
		if (result.error) {
			if (result.error.message === '重置链接无效或已失效') showState(invalid);
			else status.textContent = result.error.message || '暂时无法重置密码，请稍后再试。';
			return;
		}
		showState(success);
	} catch {
		status.textContent = '网络连接异常，请检查后重试。';
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = '保存新密码';
	}
});
