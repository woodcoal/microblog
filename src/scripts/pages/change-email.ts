/** src/pages/change-email.astro 的页面级脚本。 */
import { actions } from 'astro:actions';

const page = document.querySelector('.email-change-page') as HTMLElement;
const token = page.dataset.emailChangeToken ?? '';
const pending = document.getElementById('email-change-pending') as HTMLElement;
const action = document.getElementById('email-change-action') as HTMLElement;
const success = document.getElementById('email-change-success') as HTMLElement;
const invalid = document.getElementById('email-change-invalid') as HTMLElement;
const invalidMessage = document.getElementById('email-change-invalid-message') as HTMLElement;

function showState(state: HTMLElement) {
	[pending, action, success, invalid].forEach((element) => (element.hidden = element !== state));
	if (state !== pending) state.focus();
}

async function confirm() {
	if (!token) {
		showState(action);
		return;
	}
	showState(pending);
	try {
		const result = await actions.confirmEmailChangeAction({ token });
		if (result.error?.message === '与管理员联系处理')
			invalidMessage.textContent = '与管理员联系处理';
		showState(result.error ? invalid : success);
	} catch {
		showState(invalid);
	}
}

void confirm();
