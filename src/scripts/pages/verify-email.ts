/** src/pages/verify-email.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const page = document.querySelector('.verification-page') as HTMLElement;
const token = page.dataset.verificationToken ?? '';
const pending = document.getElementById('verification-pending') as HTMLElement;
const success = document.getElementById('verification-success') as HTMLElement;
const action = document.getElementById('verification-action') as HTMLElement;
const failure = document.getElementById('verification-failure') as HTMLElement;
const failureMessage = document.getElementById('verification-failure-message') as HTMLElement;
const resendForm = document.getElementById('resend-form') as HTMLFormElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const resendStatus = document.getElementById('resend-status')!;

function showState(state: HTMLElement) {
	[pending, success, action, failure].forEach((element) => (element.hidden = element !== state));
	// 验证成功后隐藏重发表单——用户已确认邮箱，无需再重发
	resendForm.hidden = state === success;
}

async function verify() {
	if (!token) {
		showState(action);
		return;
	}
	showState(pending);
	try {
		const result = await actions.verifyEmail({ token });
		if (result.error?.message === '与管理员联系处理')
			failureMessage.textContent = '与管理员联系处理';
		showState(result.error ? failure : success);
	} catch {
		showState(failure);
	}
}

resendForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const email = emailInput.value.trim();
	const button = resendForm.querySelector('button') as HTMLButtonElement;
	resendStatus.textContent = '';
	if (!email) {
		resendStatus.textContent = '请输入邮箱地址。';
		emailInput.focus();
		return;
	}
	button.disabled = true;
	button.textContent = '发送中...';
	try {
		const result = await actions.resendVerification({ email });
		resendStatus.textContent = result.error
			? result.error.message || '暂时无法发送，请稍后再试。'
			: result.data?.message || '若邮箱可用，验证邮件已发送。';
	} catch {
		resendStatus.textContent = '网络连接异常，请检查后重试。';
	} finally {
		button.disabled = false;
		button.textContent = '重新发送';
	}
});

void verify();
