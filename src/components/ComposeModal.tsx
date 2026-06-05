/**
 * 全局发帖弹窗组件
 *
 * 在 Base.astro 中挂载，监听 `open-compose-modal` 自定义事件。
 * 收到事件后显示发帖弹窗，发布成功后页面自动跳转，
 * 点击遮罩层或按 ESC 可关闭弹窗。
 * 使用 client:idle 延迟加载，不阻塞首屏渲染。
 */
import { useState, useEffect } from 'react';
import PostEditor from './PostEditor';

export default function ComposeModal() {
	const [isOpen, setIsOpen] = useState(false);

	/** 监听打开弹窗的自定义事件 */
	useEffect(() => {
		const handleOpen = () => setIsOpen(true);
		document.addEventListener('open-compose-modal', handleOpen);
		return () => document.removeEventListener('open-compose-modal', handleOpen);
	}, []);

	/** ESC 键关闭弹窗 */
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setIsOpen(false);
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen]);

	/** 打开时禁止背景滚动，关闭时恢复 */
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div
			className="modal-overlay compose-modal-overlay"
			onClick={(e) => {
				// 仅点击遮罩层本身时关闭，点击内容区不关闭
				if (e.target === e.currentTarget) setIsOpen(false);
			}}
		>
			<div className="modal compose-modal">
				<div className="compose-modal-header">
					<h2 className="compose-modal-title">发布新帖</h2>
					<button
						type="button"
						className="compose-modal-close"
						onClick={() => setIsOpen(false)}
						aria-label="关闭"
					>
						×
					</button>
				</div>
				<PostEditor restoreDraft />
			</div>
		</div>
	);
}
