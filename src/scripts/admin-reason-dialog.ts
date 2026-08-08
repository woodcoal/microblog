export interface ReasonedAdminActionOptions {
	title: string;
	description: string;
	confirmLabel?: string;
	submit: (input: { reason: string; requestId: string }) => Promise<{ affected: number }>;
	onSuccess: (affected: number) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim()
		? error.message
		: '操作失败，请检查网络后重试。';
}

/**
 * 所有后台处置共用的理由对话框。
 * 首次确认才分配 requestId；失败后保留理由与 ID，因此重试不会重复处置。
 */
export function runReasonedAdminAction(options: ReasonedAdminActionOptions): void {
	const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const dialog = document.createElement('dialog');
	dialog.className = 'admin-reason-dialog';
	dialog.setAttribute('aria-labelledby', 'admin-reason-dialog-title');

	const form = document.createElement('form');
	form.method = 'dialog';
	const title = document.createElement('h2');
	title.id = 'admin-reason-dialog-title';
	title.className = 'admin-modal-title';
	title.textContent = options.title;
	const description = document.createElement('p');
	description.className = 'admin-reason-dialog-description';
	description.textContent = options.description;
	const label = document.createElement('label');
	label.className = 'form-label';
	label.htmlFor = 'admin-reason-dialog-input';
	label.textContent = '处置理由（2–500 字）';
	const reason = document.createElement('textarea');
	reason.id = 'admin-reason-dialog-input';
	reason.className = 'form-input';
	reason.name = 'reason';
	reason.required = true;
	reason.minLength = 2;
	reason.maxLength = 500;
	reason.rows = 4;
	reason.placeholder = '请说明本次处置的原因';
	reason.setAttribute('aria-describedby', 'admin-reason-dialog-hint admin-reason-dialog-status');
	const hint = document.createElement('p');
	hint.id = 'admin-reason-dialog-hint';
	hint.className = 'admin-reason-dialog-hint';
	hint.textContent = '理由仅按纯文本提交和展示。';
	const status = document.createElement('p');
	status.id = 'admin-reason-dialog-status';
	status.className = 'admin-reason-dialog-status';
	status.setAttribute('aria-live', 'polite');
	const actions = document.createElement('div');
	actions.className = 'admin-modal-actions';
	const cancel = document.createElement('button');
	cancel.type = 'button';
	cancel.className = 'btn btn-outline';
	cancel.textContent = '取消';
	const confirm = document.createElement('button');
	confirm.type = 'submit';
	confirm.className = 'btn btn-primary';
	confirm.textContent = options.confirmLabel ?? '确认处置';
	actions.append(cancel, confirm);
	form.append(title, description, label, reason, hint, status, actions);
	dialog.append(form);
	document.body.append(dialog);

	let requestId: string | null = null;
	let isSubmitting = false;
	const close = () => dialog.close();
	cancel.addEventListener('click', close);
	dialog.addEventListener('cancel', (event) => {
		if (isSubmitting) event.preventDefault();
	});
	dialog.addEventListener('close', () => {
		dialog.remove();
		trigger?.focus();
	});
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (isSubmitting) return;
		const normalizedReason = reason.value.trim();
		if (normalizedReason.length < 2 || normalizedReason.length > 500) {
			status.textContent = '理由须为 2 到 500 个字符，未提交任何操作。';
			reason.setAttribute('aria-invalid', 'true');
			reason.focus();
			return;
		}
		reason.removeAttribute('aria-invalid');
		requestId ??= crypto.randomUUID();
		isSubmitting = true;
		cancel.disabled = true;
		confirm.disabled = true;
		confirm.setAttribute('aria-busy', 'true');
		status.textContent = '正在处理，请勿重复操作。';
		try {
			const { affected } = await options.submit({ reason: normalizedReason, requestId });
			if (affected < 1) throw new Error('本次操作未影响任何记录。');
			status.textContent = `处理完成，已影响 ${affected} 条记录。`;
			window.setTimeout(() => options.onSuccess(affected), 350);
		} catch (error) {
			status.textContent = errorMessage(error);
			confirm.textContent = '重试';
			cancel.disabled = false;
			confirm.disabled = false;
			confirm.removeAttribute('aria-busy');
			isSubmitting = false;
		}
	});

	dialog.showModal();
	reason.focus();
}
