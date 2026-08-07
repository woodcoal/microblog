/**
 * 管理后台站点文案编辑器。
 *
 * 使用受限的 Tiptap 编辑面，而不是原始文本框；内容仍以 Markdown 写入，预览只接受
 * 服务端站点文案 Action 返回的安全 HTML。
 */
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { actions } from 'astro:actions';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode, SubmitEvent } from 'react';
import type { Editor } from '@tiptap/core';
import type { SiteCopyKey } from '@/lib/site-copy-definitions';

const MAX_MARKDOWN_LENGTH = 4000;

interface SiteCopyEditorProps {
	entryKey: SiteCopyKey;
	title: string;
	description: string;
}

interface SiteCopy {
	html: string;
	markdown: string;
	updatedAt: string | null;
}

interface MarkdownStorage {
	markdown: {
		getMarkdown(): string;
	};
}

interface ToolbarButtonProps {
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}

function ToolbarButton({
	label,
	active = false,
	disabled = false,
	onClick,
	children
}: ToolbarButtonProps) {
	return (
		<button
			type="button"
			className={active ? 'active' : undefined}
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
		>
			{children}
		</button>
	);
}

function getMarkdown(editor: Editor): string {
	return (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
}

function formatUpdatedAt(updatedAt: string | null): string {
	if (!updatedAt) return '尚未保存版本；当前显示代码内默认文案。';
	return (
		'版本更新时间：' +
		new Intl.DateTimeFormat('zh-CN', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(updatedAt))
	);
}

function getMessage(error: { message?: string } | undefined, fallback: string): string {
	return error?.message || fallback;
}

function isAllowedLink(value: string): boolean {
	if (value.startsWith('/')) return true;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

export default function SiteCopyEditor({ entryKey, title, description }: SiteCopyEditorProps) {
	const [markdown, setMarkdown] = useState('');
	const [previewHtml, setPreviewHtml] = useState('<p>正在加载预览…</p>');
	const [updatedAt, setUpdatedAt] = useState('正在读取版本信息…');
	const [status, setStatus] = useState('');
	const [isError, setIsError] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
	const [linkValue, setLinkValue] = useState('https://');
	const [linkError, setLinkError] = useState<string | null>(null);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				blockquote: false,
				bulletList: false,
				codeBlock: false,
				heading: { levels: [1, 2, 3, 4, 5, 6] },
				horizontalRule: false,
				orderedList: false
			}),
			TiptapLink.configure({
				openOnClick: false,
				autolink: false,
				linkOnPaste: true
			}),
			Placeholder.configure({ placeholder: '开始编写站点文案…' }),
			Markdown.configure({
				html: false,
				transformCopiedText: true,
				transformPastedText: true
			})
		],
		editorProps: {
			attributes: {
				class: 'site-copy-editor-content',
				'aria-label': `${title} Markdown 文案`
			}
		},
		onUpdate: ({ editor: updatedEditor }) => setMarkdown(getMarkdown(updatedEditor))
	});

	const setCopy = useCallback(
		(copy: SiteCopy) => {
			setMarkdown(copy.markdown);
			setPreviewHtml(copy.html);
			setUpdatedAt(formatUpdatedAt(copy.updatedAt));
			editor?.commands.setContent(copy.markdown.trimStart(), { emitUpdate: false });
		},
		[editor]
	);

	useEffect(() => {
		if (!editor) return;
		let isCurrent = true;

		async function loadCopy(): Promise<void> {
			const result = await actions.getSiteCopy({ key: entryKey });
			if (!isCurrent) return;
			if (result.error || !result.data) {
				setStatus(getMessage(result.error, '读取文案失败，请刷新后重试。'));
				setIsError(true);
				setPreviewHtml('<p>预览暂不可用。</p>');
				setUpdatedAt('未能读取版本信息。');
				return;
			}

			setCopy(result.data);
			setIsLoaded(true);
		}

		void loadCopy();
		return () => {
			isCurrent = false;
		};
	}, [editor, entryKey, setCopy]);

	useEffect(() => {
		editor?.setEditable(isLoaded && !isSaving);
	}, [editor, isLoaded, isSaving]);

	const saveCopy = useCallback(
		async (event: SubmitEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!editor || isSaving || !isLoaded || markdown.length > MAX_MARKDOWN_LENGTH) return;

			setIsSaving(true);
			setStatus('正在保存…');
			setIsError(false);
			try {
				const result = await actions.updateSiteCopy({ key: entryKey, markdown });
				if (result.error || !result.data) {
					setStatus(getMessage(result.error, '保存失败，请稍后重试。'));
					setIsError(true);
					return;
				}

				setCopy(result.data);
				setStatus('已保存。');
			} catch (error) {
				setStatus(error instanceof Error ? error.message : '保存失败，请稍后重试。');
				setIsError(true);
			} finally {
				setIsSaving(false);
			}
		},
		[editor, entryKey, isLoaded, isSaving, markdown, setCopy]
	);

	const submitLink = useCallback(() => {
		if (!editor) return;

		const href = linkValue.trim();
		if (!isAllowedLink(href)) {
			setLinkError('请输入以 /、http:// 或 https:// 开头的有效链接。');
			return;
		}

		editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
		setLinkError(null);
		setIsLinkEditorOpen(false);
	}, [editor, linkValue]);

	const isTooLong = markdown.length > MAX_MARKDOWN_LENGTH;
	const isEditorDisabled = !isLoaded || isSaving;

	return (
		<form className="site-copy-admin-card" onSubmit={saveCopy}>
			<header className="site-copy-admin-card-header">
				<div>
					<h2>{title}</h2>
					<p>{description}</p>
				</div>
				<code>{entryKey}</code>
			</header>
			<div className="site-copy-admin-grid">
				<div>
					<p className="form-label" id={`${entryKey}-markdown-label`}>
						Markdown 文案
					</p>
					<div
						className="site-copy-editor"
						aria-labelledby={`${entryKey}-markdown-label`}
					>
						<div
							className="site-copy-editor-toolbar"
							role="toolbar"
							aria-label={`${title}编辑工具`}
						>
							<ToolbarButton
								label="一级标题"
								active={editor?.isActive('heading', { level: 1 })}
								disabled={isEditorDisabled}
								onClick={() =>
									editor?.chain().focus().toggleHeading({ level: 1 }).run()
								}
							>
								H1
							</ToolbarButton>
							<ToolbarButton
								label="二级标题"
								active={editor?.isActive('heading', { level: 2 })}
								disabled={isEditorDisabled}
								onClick={() =>
									editor?.chain().focus().toggleHeading({ level: 2 }).run()
								}
							>
								H2
							</ToolbarButton>
							<ToolbarButton
								label="正文"
								active={editor?.isActive('paragraph')}
								disabled={isEditorDisabled}
								onClick={() => editor?.chain().focus().setParagraph().run()}
							>
								¶
							</ToolbarButton>
							<span className="site-copy-editor-toolbar-sep" aria-hidden="true" />
							<ToolbarButton
								label="粗体（Ctrl+B）"
								active={editor?.isActive('bold')}
								disabled={isEditorDisabled}
								onClick={() => editor?.chain().focus().toggleBold().run()}
							>
								<strong>B</strong>
							</ToolbarButton>
							<ToolbarButton
								label="斜体（Ctrl+I）"
								active={editor?.isActive('italic')}
								disabled={isEditorDisabled}
								onClick={() => editor?.chain().focus().toggleItalic().run()}
							>
								<em>I</em>
							</ToolbarButton>
							<ToolbarButton
								label="删除线"
								active={editor?.isActive('strike')}
								disabled={isEditorDisabled}
								onClick={() => editor?.chain().focus().toggleStrike().run()}
							>
								<s>S</s>
							</ToolbarButton>
							<ToolbarButton
								label="行内代码"
								active={editor?.isActive('code')}
								disabled={isEditorDisabled}
								onClick={() => editor?.chain().focus().toggleCode().run()}
							>
								{'<>'}
							</ToolbarButton>
							<span className="site-copy-editor-toolbar-sep" aria-hidden="true" />
							<ToolbarButton
								label={editor?.isActive('link') ? '移除链接' : '插入链接（Ctrl+K）'}
								active={editor?.isActive('link')}
								disabled={isEditorDisabled}
								onClick={() => {
									if (editor?.isActive('link')) {
										editor.chain().focus().unsetLink().run();
										return;
									}
									setLinkValue('https://');
									setLinkError(null);
									setIsLinkEditorOpen(true);
								}}
							>
								↗
							</ToolbarButton>
						</div>
						{isLinkEditorOpen && (
							<div
								className="site-copy-editor-link-panel"
								role="group"
								aria-label="插入链接"
							>
								<label htmlFor={`${entryKey}-link`}>链接地址</label>
								<input
									id={`${entryKey}-link`}
									type="url"
									value={linkValue}
									onChange={(event) => setLinkValue(event.target.value)}
									onKeyDown={(event) => {
										if (event.key !== 'Enter') return;
										event.preventDefault();
										submitLink();
									}}
									autoFocus
									placeholder="https://example.com"
									aria-describedby={
										linkError ? `${entryKey}-link-error` : undefined
									}
								/>
								<button
									type="button"
									className="btn btn-primary"
									onClick={submitLink}
								>
									确认
								</button>
								<button
									type="button"
									className="btn"
									onClick={() => setIsLinkEditorOpen(false)}
								>
									取消
								</button>
								{linkError && (
									<p
										id={`${entryKey}-link-error`}
										className="form-error"
										role="alert"
									>
										{linkError}
									</p>
								)}
							</div>
						)}
						<div className="site-copy-editor-body">
							<EditorContent editor={editor} />
						</div>
					</div>
					<p
						className={
							isTooLong
								? 'site-copy-admin-help site-copy-admin-help-error'
								: 'site-copy-admin-help'
						}
					>
						{markdown.length}/{MAX_MARKDOWN_LENGTH} 个 Markdown
						字符；保存后立即更新安全预览。
					</p>
				</div>
				<div>
					<h3 className="site-copy-admin-preview-title">预览</h3>
					<div
						className="site-copy-admin-preview"
						aria-live="polite"
						// HTML 只来自服务端受限 Markdown 渲染器，浏览器不解析原始 Markdown。
						dangerouslySetInnerHTML={{ __html: previewHtml }}
					/>
				</div>
			</div>
			<footer className="site-copy-admin-footer">
				<p className="site-copy-admin-updated">{updatedAt}</p>
				<div className="site-copy-admin-actions">
					<p
						className={
							isError
								? 'site-copy-admin-status site-copy-admin-status-error'
								: 'site-copy-admin-status'
						}
						role="status"
						aria-live="polite"
					>
						{isTooLong ? `站点文案不能超过 ${MAX_MARKDOWN_LENGTH} 个字符。` : status}
					</p>
					<button
						type="submit"
						className="btn btn-primary"
						disabled={!isLoaded || isSaving || isTooLong}
					>
						{isSaving ? '保存中…' : '保存文案'}
					</button>
				</div>
			</footer>
		</form>
	);
}
