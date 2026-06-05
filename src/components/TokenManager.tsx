/**
 * Token 管理 React 组件
 *
 * 功能：
 * - 显示 Token 列表（名称、创建时间、最后使用时间）
 * - 创建 Token（输入名称 → 调用 POST /api/tokens）
 * - 创建成功后显示明文 Token 弹窗（强调仅此一次）
 * - 撤销 Token（确认后调用 DELETE /api/tokens/:id）
 */
import { useState, useEffect } from 'react';

/**
 * Token 数据项
 */
interface TokenItem {
	id: string;
	name: string;
	lastUsedAt: string | null;
	createdAt: string;
}

/**
 * TokenManager 组件属性
 *
 * @property initialTokens - 服务端获取的初始 Token 列表
 */
interface TokenManagerProps {
	initialTokens: TokenItem[];
}

/**
 * Token 管理组件
 *
 * 管理 API Token 的创建、列表展示和撤销。
 * 创建成功后弹窗显示明文 Token（仅此一次可查看）。
 *
 * @param props - 组件属性
 * @returns Token 管理 JSX
 */
export default function TokenManager({ initialTokens }: TokenManagerProps) {
	// Token 列表状态
	const [tokens, setTokens] = useState<TokenItem[]>(initialTokens);
	// 创建 Token 的名称输入
	const [newTokenName, setNewTokenName] = useState('');
	// 创建中加载状态
	const [creating, setCreating] = useState(false);
	// 撤销确认中的 Token ID
	const [revokingId, setRevokingId] = useState<string | null>(null);
	// 撤销中加载状态
	const [revoking, setRevoking] = useState(false);
	// 新创建的明文 Token（弹窗展示）
	const [revealedToken, setRevealedToken] = useState<{
		name: string;
		token: string;
	} | null>(null);
	// 错误信息
	const [error, setError] = useState('');

	/**
	 * Escape 键关闭弹窗
	 *
	 * 当弹窗打开时监听 keydown 事件，按下 Escape 键关闭弹窗。
	 */
	useEffect(() => {
		if (!revealedToken) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setRevealedToken(null);
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [revealedToken]);

	/**
	 * 创建新 Token
	 *
	 * 输入名称后调用 POST /api/tokens，
	 * 成功后弹窗显示明文 Token。
	 */
	const handleCreate = async () => {
		if (!newTokenName.trim()) {
			setError('请输入 Token 名称');
			return;
		}
		if (creating) return;

		setCreating(true);
		setError('');

		try {
			const res = await fetch('/api/tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newTokenName.trim() })
			});
			const data = await res.json();

			if (data.success) {
				// 添加到列表
				setTokens((prev) => [
					{
						id: data.data.id,
						name: data.data.name,
						lastUsedAt: null,
						createdAt: data.data.createdAt
					},
					...prev
				]);
				// 弹窗显示明文 Token
				setRevealedToken({
					name: data.data.name,
					token: data.data.token
				});
				setNewTokenName('');
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
	 * 撤销 Token
	 *
	 * 确认后调用 DELETE /api/tokens/:id，
	 * 成功后从列表移除。
	 */
	const handleRevoke = async (id: string) => {
		if (revoking) return;

		setRevoking(true);
		setError('');

		try {
			const res = await fetch(`/api/tokens/${id}`, {
				method: 'DELETE'
			});
			const data = await res.json();

			if (data.success) {
				setTokens((prev) => prev.filter((t) => t.id !== id));
				setRevokingId(null);
			} else {
				setError(data.error?.message || '撤销失败');
			}
		} catch {
			setError('网络错误');
		} finally {
			setRevoking(false);
		}
	};

	/**
	 * 格式化日期
	 *
	 * @param dateStr - ISO 日期字符串
	 * @returns 格式化后的日期字符串
	 */
	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return '从未使用';
		return new Date(dateStr).toLocaleString('zh-CN');
	};

	// 是否有 Token
	const hasTokens = tokens.length > 0;

	return (
		<div className="settings-section">
			<h2 className="section-title">API Token</h2>
			<p className="section-desc">API Token 用于第三方客户端访问你的账号，请妥善保管。</p>

			{/* 创建 Token 表单 */}
			<div className="create-form">
				<input
					type="text"
					placeholder="Token 名称（如：我的客户端）"
					value={newTokenName}
					onChange={(e) => setNewTokenName(e.target.value)}
					maxLength={50}
					className="input"
				/>
				<button
					type="button"
					className="btn btn-primary"
					onClick={handleCreate}
					disabled={creating}
				>
					{creating ? '创建中...' : '创建 Token'}
				</button>
			</div>

			{/* 错误提示 */}
			{error && <p className="error-text">{error}</p>}

			{/* Token 列表 */}
			{!hasTokens ? (
				<div className="empty-state">
					<p>暂无 Token</p>
				</div>
			) : (
				<div className="item-list">
					{tokens.map((token) => (
						<div key={token.id} className="item-card">
							<div className="item-info">
								<strong>{token.name}</strong>
								<span className="item-meta">
									创建于 {formatDate(token.createdAt)}
									{' · '}
									最后使用 {formatDate(token.lastUsedAt)}
								</span>
							</div>
							<div className="item-actions">
								{revokingId === token.id ? (
									<>
										<span className="confirm-text">确认撤销？</span>
										<button
											type="button"
											className="btn btn-danger btn-sm"
											onClick={() => handleRevoke(token.id)}
											disabled={revoking}
										>
											确认
										</button>
										<button
											type="button"
											className="btn btn-outline btn-sm"
											onClick={() => setRevokingId(null)}
											disabled={revoking}
										>
											取消
										</button>
									</>
								) : (
									<button
										type="button"
										className="btn btn-outline btn-sm"
										onClick={() => setRevokingId(token.id)}
									>
										撤销
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{/* 明文 Token 弹窗 */}
			{revealedToken && (
				<div className="modal-overlay" onClick={() => setRevealedToken(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<h3>Token 创建成功</h3>
						<p className="warning-text">
							⚠️ 请立即复制保存，此 Token 仅显示一次，关闭后无法再次查看！
						</p>
						<div className="token-reveal">
							<code>{revealedToken.token}</code>
							<button
								type="button"
								className="btn btn-outline btn-sm"
								onClick={() => {
									navigator.clipboard.writeText(revealedToken.token);
								}}
							>
								复制
							</button>
						</div>
						<p className="token-name">名称：{revealedToken.name}</p>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => setRevealedToken(null)}
						>
							我已保存，关闭
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
