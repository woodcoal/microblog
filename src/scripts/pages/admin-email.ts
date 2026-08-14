/** src/pages/admin/email.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const form = document.getElementById('email-settings-form') as HTMLFormElement;
const save = document.getElementById('email-settings-save') as HTMLButtonElement;
const test = document.getElementById('smtp-test') as HTMLButtonElement;
const status = document.getElementById('email-settings-status') as HTMLElement;

function setStatus(message: string, isError = false) {
	status.textContent = message;
	status.className = isError
		? 'admin-form-msg admin-form-msg-error'
		: 'admin-form-msg admin-form-msg-success';
}

function readInput() {
	const data = new FormData(form);
	const port = Number(data.get('port'));
	return {
		emailOwnershipEnabled: data.get('emailOwnershipEnabled') === 'on',
		smtp: {
			host: String(data.get('host') ?? '').trim(),
			port,
			security: String(data.get('security') ?? '') as 'tls' | 'starttls',
			username: String(data.get('username') ?? '').trim(),
			password: String(data.get('password') ?? ''),
			clearPassword: data.get('clearPassword') === 'on',
			fromName: String(data.get('fromName') ?? '').trim(),
			fromAddress: String(data.get('fromAddress') ?? '').trim()
		},
		mailTemplates: {
			verifyEmail: {
				subject: (
					document.getElementById('tpl-verify-subject') as HTMLInputElement
				).value.trim(),
				body: (document.getElementById('tpl-verify-body') as HTMLTextAreaElement).value
			},
			passwordReset: {
				subject: (
					document.getElementById('tpl-reset-subject') as HTMLInputElement
				).value.trim(),
				body: (document.getElementById('tpl-reset-body') as HTMLTextAreaElement).value
			},
			changeEmail: {
				subject: (
					document.getElementById('tpl-change-subject') as HTMLInputElement
				).value.trim(),
				body: (document.getElementById('tpl-change-body') as HTMLTextAreaElement).value
			}
		}
	};
}

function checkInput(input: ReturnType<typeof readInput>): boolean {
	if (!Number.isInteger(input.smtp.port) || input.smtp.port < 1 || input.smtp.port > 65535) {
		setStatus('SMTP 端口必须是 1 到 65535 的整数。', true);
		return false;
	}
	return true;
}

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	const input = readInput();
	if (!checkInput(input)) return;
	save.disabled = true;
	save.textContent = '保存中…';
	try {
		const result = await actions.updateSystemConfigurationAction(input);
		if (result.error) setStatus(result.error.message ?? '保存失败。', true);
		else {
			(document.getElementById('smtp-password') as HTMLInputElement).value = '';
			setStatus('邮件设置已保存。');
		}
	} catch {
		setStatus('网络连接异常，请检查后重试。', true);
	} finally {
		save.disabled = false;
		save.textContent = '保存设置';
	}
});

test.addEventListener('click', async () => {
	const input = readInput();
	if (!checkInput(input)) return;
	test.disabled = true;
	test.textContent = '测试中…';
	try {
		// 密码留空的草稿由服务端与已保存密文合并；浏览器从不读取旧密码。
		const result = await actions.testSystemSmtpAction({ smtp: input.smtp });
		setStatus(
			result.error ? (result.error.message ?? '连接测试失败。') : 'SMTP 连接测试通过。',
			Boolean(result.error)
		);
	} catch {
		setStatus('网络连接异常，请检查后重试。', true);
	} finally {
		test.disabled = false;
		test.textContent = '测试连接';
	}
});
