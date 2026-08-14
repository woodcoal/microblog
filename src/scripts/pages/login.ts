/** src/pages/login.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

// 登录表单提交处理
const form = document.getElementById('login-form') as HTMLFormElement;
const errorEl = document.getElementById('form-error')!;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const verificationHelp = document.getElementById('verification-help') as HTMLElement;
const resendForm = document.getElementById('login-resend-form') as HTMLFormElement;
const resendEmailInput = document.getElementById('resend-email') as HTMLInputElement;
const resendStatus = document.getElementById('login-resend-status')!;

function showVerificationHelp(email: string) {
	verificationHelp.hidden = false;
	resendEmailInput.value = email;
}

/**
 * 仅接受本站路径作为登录后的返回地址，避免开放重定向。
 */
function getPostLoginRedirect(): string {
	const redirect = new URLSearchParams(window.location.search).get('redirect');
	if (!redirect) return '/';

	try {
		const target = new URL(redirect, window.location.origin);
		return target.origin === window.location.origin
			? `${target.pathname}${target.search}${target.hash}`
			: '/';
	} catch {
		return '/';
	}
}

if (form) {
	form.addEventListener('submit', async (e) => {
		// 阻止默认提交
		e.preventDefault();

		const email = (form.querySelector('#email') as HTMLInputElement).value.trim();
		const password = (form.querySelector('#password') as HTMLInputElement).value;

		// 清除之前的错误提示
		errorEl.textContent = '';

		// 前端校验：非空
		if (!email || !password) {
			errorEl.textContent = '请填写邮箱和密码';
			return;
		}

		// 禁用按钮，防止重复提交
		submitBtn.disabled = true;
		submitBtn.textContent = '登录中...';

		try {
			// 调用 Astro Action 登录
			// Astro 6 Actions 返回 SafeResult：{ data, error }
			const result = await actions.login({ email, password });

			// 检查是否返回错误
			if (result.error) {
				errorEl.textContent = result.error.message || '登录失败';
				if (result.error.message === '请先完成邮箱验证') showVerificationHelp(email);
				return;
			}

			// 登录成功：服务端已通过 setTokenCookie 设置 HttpOnly cookie
			// 仅将 token 写入 localStorage 供客户端逻辑使用
			if (result.data) {
				localStorage.setItem('token', result.data.token);
			}

			// 回到受保护页面；无来源时维持既有首页行为。
			window.location.href = getPostLoginRedirect();
		} catch (e) {
			// 兜底处理意外异常
			errorEl.textContent = e instanceof Error ? e.message : '登录失败';
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = '登录';
		}
	});
}

if (resendForm) {
	resendForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const email = resendEmailInput.value.trim();
		const button = resendForm.querySelector('button') as HTMLButtonElement;
		resendStatus.textContent = '';
		if (!email) {
			resendStatus.textContent = '请输入邮箱地址。';
			resendEmailInput.focus();
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
}
