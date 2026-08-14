/** src/pages/register.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const form = document.getElementById('register-form') as HTMLFormElement;

// 字段引用
const usernameInput = document.getElementById('username') as HTMLInputElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const confirmInput = document.getElementById('confirmPassword') as HTMLInputElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const errorEl = document.getElementById('form-error')!;
const usernameError = document.getElementById('username-error')!;
const emailError = document.getElementById('email-error')!;
const confirmError = document.getElementById('confirm-error')!;
const usernameHint = document.getElementById('username-hint')!;
const passwordHint = document.getElementById('password-hint')!;
const confirmHint = document.getElementById('confirm-hint')!;
const successPanel = document.getElementById('registration-success') as HTMLElement;
const successMessage = document.getElementById('registration-success-message') as HTMLElement;
const resendForm = document.getElementById('registration-resend-form') as HTMLFormElement;
const resendEmailInput = document.getElementById('registration-resend-email') as HTMLInputElement;
const resendStatus = document.getElementById('registration-resend-status')!;

/**
 * 清除指定字段的错误提示
 */
function clearFieldError(el: HTMLElement) {
	el.textContent = '';
	el.classList.remove('form-hint-ok', 'form-hint-err');
}

/**
 * 显示字段提示信息
 */
function showFieldHint(el: HTMLElement, msg: string, ok: boolean) {
	el.textContent = msg;
	el.className = 'form-hint form-hint-visible' + (ok ? ' form-hint-ok' : ' form-hint-err');
}

// 用户名实时校验
if (usernameInput) {
	usernameInput.addEventListener('input', () => {
		clearFieldError(usernameError);
		clearFieldError(usernameHint);
		const v = usernameInput.value.trim();
		if (!v) return;
		if (!/^[a-zA-Z0-9_]{3,20}$/.test(v)) {
			showFieldHint(usernameHint, '需为 3-20 位字母、数字或下划线', false);
		} else {
			showFieldHint(usernameHint, '格式符合要求，将由服务器确认是否可用', true);
		}
	});
}

// 密码强度即时提示
if (passwordInput) {
	passwordInput.addEventListener('input', () => {
		const v = passwordInput.value;
		if (!v) {
			clearFieldError(passwordHint);
			return;
		}
		if (v.length < Number(passwordInput.getAttribute('minlength') || 6)) {
			showFieldHint(passwordHint, '密码长度不足', false);
		} else {
			showFieldHint(passwordHint, '密码强度足够', true);
		}
	});
}

// 确认密码即时校验
if (confirmInput) {
	confirmInput.addEventListener('input', () => {
		clearFieldError(confirmError);
		const v = confirmInput.value;
		if (!v) {
			clearFieldError(confirmHint);
			return;
		}
		if (v !== passwordInput.value) {
			showFieldHint(confirmHint, '两次密码不一致', false);
		} else {
			showFieldHint(confirmHint, '密码一致', true);
		}
	});
}

// 失焦时清除 hint（减少干扰）
[usernameInput, confirmInput].forEach((el) => {
	el?.addEventListener('blur', () => {
		const hintId = el.id === 'confirmPassword' ? 'confirm-hint' : el.id + '-hint';
		clearFieldError(document.getElementById(hintId) || el);
	});
});
if (passwordInput) {
	passwordInput.addEventListener('blur', () => clearFieldError(passwordHint));
}

if (emailInput) emailInput.focus();

if (form) {
	form.addEventListener('submit', async (e) => {
		e.preventDefault();

		const username = usernameInput.value.trim();
		const email = emailInput.value.trim();
		const password = passwordInput.value;
		const confirmPassword = confirmInput.value;

		// 清除之前的错误
		clearFieldError(errorEl);
		clearFieldError(usernameError);
		clearFieldError(emailError);
		clearFieldError(confirmError);

		// 仅在填写时提供格式反馈；保留词、占用和最终可用性均由服务端裁决。
		if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
			usernameError.textContent = '用户名需为 3-20 位字母、数字或下划线';
			usernameInput.focus();
			return;
		}

		// 前端验证：密码确认
		if (password !== confirmPassword) {
			confirmError.textContent = '两次输入的密码不一致';
			confirmInput.focus();
			return;
		}

		// 禁用按钮防重复提交
		submitBtn.disabled = true;
		submitBtn.textContent = '注册中...';

		try {
			// 调用 Astro Action 注册
			// Astro 6 Actions 返回 SafeResult：{ data, error }
			const result = await actions.register({
				username: username || undefined,
				email,
				password
			});

			// 检查是否返回错误
			if (result.error) {
				errorEl.textContent = result.error.message || '注册失败，请重试';
				return;
			}

			const needsVerification = result.data?.nextAction === 'verify_email';
			if (!needsVerification) {
				// 已自动登录，直接跳转首页
				window.location.href = '/';
				return;
			}
			successMessage.textContent =
				'验证邮件已发送。账号在完成邮箱验证前无法登录或使用完整功能，请前往邮箱打开验证链接。';
			successPanel.hidden = false;
			resendEmailInput.value = email;
			resendForm.hidden = false;
			form.reset();
			successPanel.focus();
		} catch (e) {
			// ActionError 通过 e.message 获取错误信息
			errorEl.textContent = e instanceof Error ? e.message : '注册失败，请重试';
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = '注册';
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
