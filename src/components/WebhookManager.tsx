/**
 * Webhook 管理 React 组件
 *
 * 功能：
 * - 显示 Webhook 列表（URL、事件、状态、Secret）
 * - 创建 Webhook（输入 URL + 选择事件）
 * - 编辑 Webhook（修改 URL/事件/启用状态）
 * - 删除 Webhook（确认后调用 DELETE /api/webhooks/:id）
 * - 创建成功后显示 Secret（仅此一次）
 */
import { useState, useEffect } from 'react';

/**
 * Webhook 数据项
 */
interface WebhookItem {
	id: string;
	userId: string;
	url: string;
	secret: string;
	events: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
 * WebhookManager 组件属性
 *
 * @property initialWebhooks - 服务端获取的初始 Webhook 列表
 */
interface WebhookManagerProps {
	initialWebhooks: WebhookItem[];
}

/** 允许的 Webhook 事件选项 */
const EVENT_OPTIONS = [
	{ value: 'notification.follow', label: '关注通知' },
	{ value: 'notification.comment', label: '评论通知' },
	{ value: 'notification.like', label: '点赞通知' },
	{ value: 'notification.mention', label: '提及通知' }
];

/**
 * Webhook 管理组件
 *
 * 管理 Webhook 的创建、编辑、删除和启用/禁用。
 * 创建成功后弹窗显示明文 Secret（仅此一次可查看）。
 *
 * @param props - 组件属性
 * @returns Webhook 管理 JSX
 */
export default function WebhookManager({ initialWebhooks }: WebhookManagerProps) {
	// Webhook 列表状态
	const [webhooks, setWebhooks] = useState<WebhookItem[]>(initialWebhooks);
	// 创建表单状态
	const [newUrl, setNewUrl] = useState('');
	const [newEvents, setNewEvents] = useState<string[]>(['notification.follow']);
	// 创建中加载状态
	const [creating, setCreating] = useState(false);
	// 编辑中的 Webhook ID
	const [editingId, setEditingId] = useState<string | null>(null);
	// 编辑表单状态
	const [editUrl, setEditUrl] = useState('');
	const [editEvents, setEditEvents] = useState<string[]>([]);
	const [editIsActive, setEditIsActive] = useState(true);
	// 编辑中加载状态
	const [saving, setSaving] = useState(false);
	// 删除确认中的 Webhook ID
	const [deletingId, setDeletingId] = useState<string | null>(null);
	// 删除中加载状态
	const [deleting, setDeleting] = useState(false);
	// 新创建的明文 Secret（弹窗展示）
	const [revealedSecret, setRevealedSecret] = useState<{
		url: string;
		secret: string;
		isNew: boolean;
	} | null>(null);
	// 密钥查看中加载状态
	const [revealingId, setRevealingId] = useState<string | null>(null);
	// 错误信息
	const [error, setError] = useState('');

	/**
	 * Escape 键关闭弹窗
	 *
	 * 当弹窗打开时监听 keydown 事件，按下 Escape 键关闭弹窗。
	 */
	useEffect(() => {
		if (!revealedSecret) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setRevealedSecret(null);
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [revealedSecret]);

	/**
	 * 切换创建表单中的事件选择
	 *
	 * @param event - 事件类型值
	 */
	const toggleNewEvent = (event: string) => {
		setNewEvents((prev) =>
			prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
		);
	};

	/**
	 * 切换编辑表单中的事件选择
	 *
	 * @param event - 事件类型值
	 */
	const toggleEditEvent = (event: string) => {
		setEditEvents((prev) =>
			prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
		);
	};

	/**
	 * 创建新 Webhook
	 *
	 * 输入 URL 和选择事件后调用 POST /api/webhooks，
	 * 成功后弹窗显示明文 Secret。
	 */
	const handleCreate = async () => {
		if (!newUrl.trim()) {
			setError('请输入 Webhook URL');
			return;
		}
		if (newEvents.length === 0) {
			setError('请至少选择一个事件类型');
			return;
		}
		if (creating) return;

		setCreating(true);
		setError('');

		try {
			const res = await fetch('/api/webhooks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: newUrl.trim(), events: newEvents })
			});
			const data = await res.json();

			if (data.success) {
				// 添加到列表（secret 脱敏）
				const webhook = data.data.webhook;
				setWebhooks((prev) => [
					{
						...webhook,
						secret: webhook.secret.slice(0, 8) + '***'
					},
					...prev
				]);
				// 弹窗显示明文 Secret
				setRevealedSecret({
					url: webhook.url,
					secret: webhook.secret,
					isNew: true
				});
				setNewUrl('');
				setNewEvents(['notification.follow']);
			} else {
				setError(data.error?.message || '创建失败');
			}
		} catch {
			setError('网络错误');
		} finally {
			setCreating(false);
		}
	};

	/**
	 * 进入编辑模式
	 *
	 * 加载当前 Webhook 的数据到编辑表单。
	 *
	 * @param webhook - 要编辑的 Webhook
	 */
	const startEditing = (webhook: WebhookItem) => {
		setEditingId(webhook.id);
		setEditUrl(webhook.url);
		try {
			setEditEvents(JSON.parse(webhook.events));
		} catch {
			setEditEvents([]);
		}
		setEditIsActive(webhook.isActive);
		setError('');
	};

	/**
	 * 查看 Webhook 明文 Secret
	 *
	 * 调用 GET /api/webhooks/:id/secret 获取明文密钥并弹窗展示。
	 *
	 * @param webhook - 目标 Webhook
	 */
	const handleRevealSecret = async (webhook: WebhookItem) => {
		if (revealingId) return;

		setRevealingId(webhook.id);
		setError('');

		try {
			const res = await fetch(`/api/webhooks/${webhook.id}/secret`);
			const data = await res.json();

			if (data.success) {
				setRevealedSecret({
					url: webhook.url,
					secret: data.data.secret,
					isNew: false
				});
			} else {
				setError(data.error?.message || '获取密钥失败');
			}
		} catch {
			setError('网络错误');
		} finally {
			setRevealingId(null);
		}
	};

	/**
	 * 保存编辑
	 *
	 * 调用 PUT /api/webhooks/:id 更新 Webhook。
	 */
	const handleSave = async () => {
		if (!editingId || saving) return;

		if (!editUrl.trim()) {
			setError('URL 不能为空');
			return;
		}
		if (editEvents.length === 0) {
			setError('请至少选择一个事件类型');
			return;
		}

		setSaving(true);
		setError('');

		try {
			const res = await fetch(`/api/webhooks/${editingId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: editUrl.trim(),
					events: editEvents,
					isActive: editIsActive
				})
			});
			const data = await res.json();

			if (data.success) {
				// 更新列表中的数据
				setWebhooks((prev) =>
					prev.map((w) =>
						w.id === editingId
							? {
									...w,
									url: editUrl.trim(),
									events: JSON.stringify(editEvents),
									isActive: editIsActive,
									updatedAt: new Date().toISOString()
								}
							: w
					)
				);
				setEditingId(null);
			} else {
				setError(data.error?.message || '更新失败');
			}
		} catch {
			setError('网络错误');
		} finally {
			setSaving(false);
		}
	};

	/**
	 * 切换 Webhook 启用/禁用状态
	 *
	 * 调用 PUT /api/webhooks/:id 更新 isActive。
	 *
	 * @param webhook - 要切换状态的 Webhook
	 */
	const toggleActive = async (webhook: WebhookItem) => {
		try {
			const res = await fetch(`/api/webhooks/${webhook.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !webhook.isActive })
			});
			const data = await res.json();

			if (data.success) {
				setWebhooks((prev) =>
					prev.map((w) => (w.id === webhook.id ? { ...w, isActive: !w.isActive } : w))
				);
			}
		} catch {
			setError('切换状态失败');
		}
	};

	/**
	 * 删除 Webhook
	 *
	 * 确认后调用 DELETE /api/webhooks/:id。
	 */
	const handleDelete = async () => {
		if (!deletingId || deleting) return;

		setDeleting(true);
		setError('');

		try {
			const res = await fetch(`/api/webhooks/${deletingId}`, {
				method: 'DELETE'
			});
			const data = await res.json();

			if (data.success) {
				setWebhooks((prev) => prev.filter((w) => w.id !== deletingId));
				setDeletingId(null);
			} else {
				setError(data.error?.message || '删除失败');
			}
		} catch {
			setError('网络错误');
		} finally {
			setDeleting(false);
		}
	};

	/**
	 * 解析事件 JSON 为可读标签
	 *
	 * @param eventsJson - JSON 格式的事件数组字符串
	 * @returns 事件标签数组
	 */
	const parseEvents = (eventsJson: string): string[] => {
		try {
			const events: string[] = JSON.parse(eventsJson);
			return events.map((e) => {
				const option = EVENT_OPTIONS.find((o) => o.value === e);
				return option ? option.label : e;
			});
		} catch {
			return [];
		}
	};

	// 是否有 Webhook
	const hasWebhooks = webhooks.length > 0;

	return (
		<div className="settings-section">
			<h2 className="section-title">Webhook</h2>
			<p className="section-desc">当收到通知时，Webhook 会向指定 URL 发送 HTTP POST 请求。</p>

			{/* 创建 Webhook 表单 */}
			<div className="create-form">
				<input
					type="url"
					placeholder="Webhook URL（如 https://example.com/webhook）"
					value={newUrl}
					onChange={(e) => setNewUrl(e.target.value)}
					className="input"
				/>
				<div className="event-checkboxes">
					{EVENT_OPTIONS.map((option) => (
						<label key={option.value} className="checkbox-label">
							<input
								type="checkbox"
								checked={newEvents.includes(option.value)}
								onChange={() => toggleNewEvent(option.value)}
							/>
							{option.label}
						</label>
					))}
				</div>
				<button
					type="button"
					className="btn btn-primary"
					onClick={handleCreate}
					disabled={creating}
				>
					{creating ? '创建中...' : '创建 Webhook'}
				</button>
			</div>

			{/* 错误提示 */}
			{error && <p className="error-text">{error}</p>}

			{/* Webhook 列表 */}
			{!hasWebhooks ? (
				<div className="empty-state">
					<p>暂无 Webhook</p>
				</div>
			) : (
				<div className="item-list">
					{webhooks.map((webhook) => (
						<div key={webhook.id} className="item-card">
							{editingId === webhook.id ? (
								/* 编辑模式 */
								<div className="edit-form">
									<input
										type="url"
										value={editUrl}
										onChange={(e) => setEditUrl(e.target.value)}
										className="input"
										placeholder="Webhook URL"
									/>
									<div className="event-checkboxes">
										{EVENT_OPTIONS.map((option) => (
											<label key={option.value} className="checkbox-label">
												<input
													type="checkbox"
													checked={editEvents.includes(option.value)}
													onChange={() => toggleEditEvent(option.value)}
												/>
												{option.label}
											</label>
										))}
									</div>
									<div className="edit-actions">
										<button
											type="button"
											className="btn btn-primary btn-sm"
											onClick={handleSave}
											disabled={saving}
										>
											{saving ? '保存中...' : '保存'}
										</button>
										<button
											type="button"
											className="btn btn-outline btn-sm"
											onClick={() => setEditingId(null)}
											disabled={saving}
										>
											取消
										</button>
									</div>
								</div>
							) : (
								/* 展示模式 */
								<>
									<div className="item-info">
										<strong className="webhook-url">{webhook.url}</strong>
										<span className="item-meta">
											事件：{parseEvents(webhook.events).join('、')}
											{' · '}
											Secret：{webhook.secret}
											{' · '}
											状态：{webhook.isActive ? '启用' : '禁用'}
										</span>
									</div>
									<div className="item-actions">
										<button
											type="button"
											className={`btn btn-sm ${webhook.isActive ? 'btn-outline' : 'btn-primary'}`}
											onClick={() => toggleActive(webhook)}
										>
											{webhook.isActive ? '禁用' : '启用'}
										</button>
										<button
											type="button"
											className="btn btn-outline btn-sm"
											onClick={() => startEditing(webhook)}
										>
											编辑
										</button>
										<button
											type="button"
											className="btn btn-outline btn-sm"
											onClick={() => handleRevealSecret(webhook)}
											disabled={revealingId === webhook.id}
										>
											{revealingId === webhook.id ? '获取中...' : '查看密钥'}
										</button>
										{deletingId === webhook.id ? (
											<>
												<span className="confirm-text">确认删除？</span>
												<button
													type="button"
													className="btn btn-danger btn-sm"
													onClick={handleDelete}
													disabled={deleting}
												>
													确认
												</button>
												<button
													type="button"
													className="btn btn-outline btn-sm"
													onClick={() => setDeletingId(null)}
													disabled={deleting}
												>
													取消
												</button>
											</>
										) : (
											<button
												type="button"
												className="btn btn-danger btn-sm"
												onClick={() => setDeletingId(webhook.id)}
											>
												删除
											</button>
										)}
									</div>
								</>
							)}
						</div>
					))}
				</div>
			)}

			{/* 明文 Secret 弹窗 */}
			{revealedSecret && (
				<div className="modal-overlay" onClick={() => setRevealedSecret(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<h3>{revealedSecret.isNew ? 'Webhook 创建成功' : 'Webhook 签名密钥'}</h3>
						<p className="warning-text">
							{revealedSecret.isNew
								? '⚠️ 请立即复制保存 Secret，此 Secret 仅显示一次，关闭后无法再次查看！'
								: '⚠️ 关闭后如需再次查看可点击「查看密钥」按钮。请勿泄露给他人！'}
						</p>
						<div className="token-reveal">
							<code>{revealedSecret.secret}</code>
							<button
								type="button"
								className="btn btn-outline btn-sm"
								onClick={() => {
									navigator.clipboard.writeText(revealedSecret.secret);
								}}
							>
								复制
							</button>
						</div>
						<p className="token-name">URL：{revealedSecret.url}</p>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => setRevealedSecret(null)}
						>
							关闭
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
