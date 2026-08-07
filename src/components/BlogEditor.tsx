/**
 * 博客编辑器组件（React Island — 简化版 Tiptap 富文本编辑器）
 *
 * 核心特性：
 * - 顶部固定工具栏：标题/格式/列表/块级/插入 分组按钮
 * - Tiptap 富文本编辑器核心（所见即所得）
 * - 图片上传：点击按钮 + 粘贴图片
 * - Markdown 双向转换
 * - 代码块语法高亮（lowlight）
 * - 草稿自动保存（localStorage，1 秒防抖）
 *
 * 通信方式：
 * - 监听 blog-editor-do-submit 事件 → 触发提交
 * - 派发 blog-editor-submit 事件 → 传出 markdown 内容
 * - 监听 blog-editor-submit-done 事件 → 重置 loading
 * - 派发 blog-editor-draft-restored 事件 → 通知页面有草稿恢复
 * - 监听 blog-editor-clear-draft 事件 → 清除草稿
 *
 * @property initialContent - 初始 Markdown 内容（编辑时预填充）
 * @property onSubmit - 提交回调，接收 Markdown 字符串
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode, SyntheticEvent } from 'react';
import type { Editor } from '@tiptap/core';
import { actions } from 'astro:actions';

/** lowlight 实例，用于代码块语法高亮 */
const lowlight = createLowlight(common);

/** 草稿存储键名 */
const DEFAULT_DRAFT_KEY = 'blog-draft';

/**
 * 博客编辑器组件属性
 *
 * @property initialContent - 初始 Markdown 内容
 * @property onSubmit - 提交回调函数
 */
interface BlogEditorProps {
	initialContent?: string;
	onSubmit?: (content: string) => void;
	/** 承载发布/保存事件的页面容器 ID */
	containerId?: string;
	/** 草稿存储键；编辑态使用独立键，避免覆盖新建草稿 */
	draftKey?: string;
	/** 页面标题输入框 ID */
	titleInputId?: string;
	/** 页面分类选择框 ID */
	categorySelectId?: string;
	/** 页面可见度选择框 ID */
	visibilitySelectId?: string;
}

/**
 * 草稿数据结构
 *
 * @property title - 文章标题
 * @property content - Markdown 内容
 * @property categoryId - 分类 ID
 * @property visibility - 可见度
 * @property savedAt - 保存时间
 */
interface DraftData {
	title: string;
	content: string;
	categoryId: string;
	visibility: string;
	savedAt: string;
}

interface MarkdownStorage {
	markdown: {
		getMarkdown(): string;
	};
}

interface ToolbarButtonProps {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
}

/**
 * 统一编辑器工具按钮的视觉、提示和按下状态。
 * 可见内容保持紧凑，完整名称始终由辅助技术和原生提示提供。
 */
function ToolbarButton({ label, active = false, onClick, children }: ToolbarButtonProps) {
	return (
		<button
			type="button"
			className={active ? 'active' : undefined}
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={active}
		>
			{children}
		</button>
	);
}

function getMarkdown(editor: Editor): string {
	return (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
}

/**
 * 上传图片到服务器
 *
 * 使用 Astro Action 调用统一的上传接口。
 *
 * @param file - 要上传的图片文件
 * @returns 上传成功后的图片 URL 或错误信息
 */
async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('fileType', 'image');

	try {
		const result = await actions.uploadMedia(formData);
		if (result.data?.url) {
			return { url: result.data.url };
		}
		return { error: result.error?.message || '图片上传失败，请重试' };
	} catch (error) {
		return { error: error instanceof Error ? error.message : '图片上传失败，请重试' };
	}
}

/**
 * 博客编辑器组件
 *
 * 简化版 Tiptap 富文本编辑器，顶部固定工具栏，支持草稿自动保存。
 * 只负责内容区域（标题由页面独立 input 处理）。
 *
 * @param props - 组件属性
 * @returns 编辑器 JSX
 */
export default function BlogEditor({
	initialContent = '',
	onSubmit,
	containerId = 'blog-compose-container',
	draftKey = DEFAULT_DRAFT_KEY,
	titleInputId = 'blog-compose-title',
	categorySelectId = 'blog-compose-category',
	visibilitySelectId = 'blog-compose-visibility'
}: BlogEditorProps) {
	// 服务端已在写入时清理空白；这里兼容修复前保存的内容和草稿。
	const initialEditorContent = initialContent.trimStart();
	/** 加载状态 */
	const [loading, setLoading] = useState(false);
	/** 图片上传错误信息 */
	const [uploadError, setUploadError] = useState<string | null>(null);
	/** 链接编辑面板状态；避免使用不可访问的浏览器 prompt。 */
	const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
	const [linkValue, setLinkValue] = useState('https://');
	const [linkError, setLinkError] = useState<string | null>(null);
	/** 编辑器实例引用，用于在 handlePaste 闭包中安全访问 */
	const editorRef = useRef<Editor | null>(null);
	/** 图片上传文件输入引用 */
	const fileInputRef = useRef<HTMLInputElement>(null);
	/** 草稿防抖定时器引用 */
	const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Tiptap 编辑器实例 */
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				codeBlock: false,
				heading: { levels: [1, 2, 3] }
			}),
			TiptapImage.configure({
				inline: false,
				allowBase64: true
			}),
			TiptapLink.configure({
				openOnClick: false,
				autolink: true
			}),
			Placeholder.configure({
				placeholder: '开始写作...'
			}),
			CodeBlockLowlight.configure({ lowlight }),
			TaskList,
			TaskItem.configure({ nested: true }),
			Underline,
			Markdown.configure({
				html: true,
				transformPastedText: true,
				transformCopiedText: true
			})
		],
		content: initialEditorContent,
		editorProps: {
			attributes: {
				class: 'blog-editor-content'
			},
			/**
			 * 处理粘贴事件，检测剪贴板中的图片并上传
			 *
			 * 修复：使用 editorRef.current 而非闭包中的 editor，
			 * 避免闭包引用过期导致粘贴图片不工作。
			 *
			 * @param view - ProseMirror EditorView
			 * @param event - 剪贴板事件
			 * @returns true 表示已处理该事件
			 */
			handlePaste: (_view, event: ClipboardEvent) => {
				const items = event.clipboardData?.items;
				if (!items) return false;

				// 收集剪贴板中的图片文件
				const imageFiles: File[] = [];
				for (let i = 0; i < items.length; i++) {
					if (items[i].type.startsWith('image/')) {
						const file = items[i].getAsFile();
						if (file) imageFiles.push(file);
					}
				}

				// 有图片时上传并插入
				if (imageFiles.length > 0) {
					event.preventDefault();
					// 关键修复：使用 editorRef.current 获取最新编辑器实例
					const currentEditor = editorRef.current;
					if (!currentEditor) return true;

					(async () => {
						for (const file of imageFiles) {
							try {
								const upload = await uploadImage(file);
								if (upload.url) {
									currentEditor
										.chain()
										.focus()
										.setImage({ src: upload.url })
										.run();
								} else {
									setUploadError(upload.error || '图片上传失败，请重试');
								}
							} catch (error) {
								setUploadError(
									error instanceof Error ? error.message : '图片上传失败，请重试'
								);
							}
						}
					})();
					return true;
				}
				return false;
			}
		},
		/** 编辑器内容更新时防抖保存草稿 */
		onUpdate: ({ editor }) => {
			saveDraftDebounced(editor);
		}
	});

	// 同步编辑器引用，供 handlePaste 闭包使用
	useEffect(() => {
		editorRef.current = editor ?? null;
	}, [editor]);

	/**
	 * 防抖保存草稿
	 *
	 * 内容变化后 1 秒内无新变化时保存草稿到 localStorage。
	 *
	 * @param ed - Tiptap 编辑器实例
	 */
	const saveDraftDebounced = useCallback((ed: Editor) => {
		if (draftTimerRef.current) {
			clearTimeout(draftTimerRef.current);
		}
		draftTimerRef.current = setTimeout(() => {
			saveDraft(ed);
		}, 1000);
	}, []);

	/**
	 * 保存草稿到 localStorage
	 *
	 * 将当前编辑器内容（Markdown）和页面上的标题、分类、可见度等信息
	 * 序列化为 JSON 存入 localStorage。
	 *
	 * @param ed - Tiptap 编辑器实例
	 */
	const saveDraft = useCallback(
		(ed: Editor) => {
			try {
				const markdown = getMarkdown(ed);
				// 从页面 DOM 获取标题、分类、可见度等字段
				const titleInput = document.getElementById(titleInputId) as HTMLInputElement | null;
				const categorySelect = document.getElementById(
					categorySelectId
				) as HTMLSelectElement | null;
				const visibilitySelect = document.getElementById(
					visibilitySelectId
				) as HTMLSelectElement | null;

				const draft: DraftData = {
					title: titleInput?.value || '',
					content: markdown,
					categoryId: categorySelect?.value || '',
					visibility: visibilitySelect?.value || 'public',
					savedAt: new Date().toISOString()
				};
				localStorage.setItem(draftKey, JSON.stringify(draft));
			} catch {
				// 草稿保存失败静默处理
			}
		},
		[categorySelectId, draftKey, titleInputId, visibilitySelectId]
	);

	/**
	 * 恢复草稿
	 *
	 * 组件挂载时检查 localStorage 中是否有草稿，
	 * 如果有且编辑器内容为空，则恢复草稿内容并通知页面。
	 */
	const restoreDraft = useCallback(() => {
		if (!editor) return;
		try {
			const raw = localStorage.getItem(draftKey);
			if (!raw) return;

			const draft: DraftData = JSON.parse(raw);
			// 仅在编辑器内容为空时恢复草稿（避免覆盖已有内容）
			const currentMarkdown = getMarkdown(editor);
			if (currentMarkdown.trim()) return;

			// 恢复编辑器内容
			editor.commands.setContent(draft.content.trimStart());

			// 恢复页面表单字段
			const titleInput = document.getElementById(titleInputId) as HTMLInputElement | null;
			const categorySelect = document.getElementById(
				categorySelectId
			) as HTMLSelectElement | null;
			const visibilitySelect = document.getElementById(
				visibilitySelectId
			) as HTMLSelectElement | null;

			if (titleInput && draft.title) titleInput.value = draft.title;
			if (categorySelect && draft.categoryId) categorySelect.value = draft.categoryId;
			if (visibilitySelect && draft.visibility) visibilitySelect.value = draft.visibility;

			// 通知页面有草稿恢复
			const container = document.getElementById(containerId);
			if (container) {
				container.dispatchEvent(
					new CustomEvent('blog-editor-draft-restored', {
						detail: draft,
						bubbles: true
					})
				);
			}
		} catch {
			// 草稿恢复失败静默处理
		}
	}, [categorySelectId, containerId, draftKey, editor, titleInputId, visibilitySelectId]);

	/**
	 * 清除草稿
	 *
	 * 从 localStorage 中删除草稿数据。
	 */
	const clearDraft = useCallback(() => {
		if (draftTimerRef.current) {
			clearTimeout(draftTimerRef.current);
			draftTimerRef.current = null;
		}
		try {
			localStorage.removeItem(draftKey);
			editor?.commands.setContent('', { emitUpdate: false });

			const titleInput = document.getElementById(titleInputId) as HTMLInputElement | null;
			const categorySelect = document.getElementById(
				categorySelectId
			) as HTMLSelectElement | null;
			const visibilitySelect = document.getElementById(
				visibilitySelectId
			) as HTMLSelectElement | null;
			if (titleInput) titleInput.value = '';
			if (categorySelect) categorySelect.value = '';
			if (visibilitySelect) visibilitySelect.value = 'public';
		} catch {
			// 清除失败静默处理
		}
	}, [categorySelectId, draftKey, editor, titleInputId, visibilitySelectId]);

	// 挂载时恢复草稿
	useEffect(() => {
		restoreDraft();
	}, [restoreDraft]);

	/**
	 * 监听发布完成事件，重置 loading 状态
	 */
	useEffect(() => {
		const container = document.getElementById(containerId);
		if (!container) return;
		const handleDone = () => setLoading(false);
		container.addEventListener('blog-editor-submit-done', handleDone);
		return () => container.removeEventListener('blog-editor-submit-done', handleDone);
	}, [containerId]);

	/**
	 * 监听页面顶部的发布按钮事件
	 *
	 * 页面点击"发布文章"按钮时派发 blog-editor-do-submit 事件，
	 * 编辑器收到后提取 markdown 内容并派发 blog-editor-submit 事件。
	 */
	useEffect(() => {
		const container = document.getElementById(containerId);
		if (!container || !editor) return;

		const handleDoSubmit = () => {
			if (loading) return;
			const markdown = getMarkdown(editor);

			if (onSubmit) {
				onSubmit(markdown);
				return;
			}

			setLoading(true);
			container.dispatchEvent(
				new CustomEvent('blog-editor-submit', {
					detail: markdown,
					bubbles: true
				})
			);
		};

		container.addEventListener('blog-editor-do-submit', handleDoSubmit);
		return () => container.removeEventListener('blog-editor-do-submit', handleDoSubmit);
	}, [clearDraft, containerId, editor, loading, onSubmit]);

	/**
	 * 监听清除草稿事件
	 */
	useEffect(() => {
		const container = document.getElementById(containerId);
		if (!container) return;
		container.addEventListener('blog-editor-clear-draft', clearDraft);
		return () => container.removeEventListener('blog-editor-clear-draft', clearDraft);
	}, [clearDraft, containerId]);

	/**
	 * 组件卸载时清理草稿自动保存定时器，防止内存泄漏
	 */
	useEffect(() => {
		return () => {
			if (draftTimerRef.current) {
				clearTimeout(draftTimerRef.current);
			}
		};
	}, []);

	/**
	 * 处理文件选择变化时上传图片
	 *
	 * @param e - 文件输入变化事件
	 */
	const handleFileChange = useCallback(
		async (e: ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files || !editor) return;

			setUploadError(null);
			for (const file of Array.from(files)) {
				const upload = await uploadImage(file);
				if (upload.url) {
					editor.chain().focus().setImage({ src: upload.url }).run();
				} else {
					setUploadError(upload.error || '图片上传失败，请重试');
				}
			}
			e.target.value = '';
		},
		[editor]
	);

	/**
	 * 打开链接编辑面板，或在已有链接上直接移除链接。
	 */
	const handleLinkButton = useCallback(() => {
		if (!editor) return;
		if (editor.isActive('link')) {
			editor.chain().focus().unsetLink().run();
			return;
		}
		setLinkValue('https://');
		setLinkError(null);
		setIsLinkEditorOpen(true);
	}, [editor]);

	/** 提交经过协议校验的链接，阻止脚本协议写入文稿。 */
	const handleLinkSubmit = useCallback(
		(event: SyntheticEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!editor) return;

			const href = linkValue.trim();
			try {
				const url = new URL(href);
				if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
					throw new Error('unsupported protocol');
				}
			} catch {
				setLinkError('请输入以 http://、https:// 或 mailto: 开头的有效链接。');
				return;
			}

			editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
			setLinkError(null);
			setIsLinkEditorOpen(false);
		},
		[editor, linkValue]
	);

	// 编辑器未就绪时不渲染
	if (!editor) return null;

	return (
		<div className="blog-editor">
			{/* 与 Notion 类似：按写作、格式、内容块、插入分组，名称在提示和读屏中保持一致。 */}
			<div className="blog-editor-toolbar" role="toolbar" aria-label="文章编辑工具">
				<div className="blog-editor-toolbar-group" role="group" aria-label="历史记录">
					<ToolbarButton
						label="撤销（Ctrl+Z）"
						onClick={() => editor.chain().focus().undo().run()}
					>
						↶
					</ToolbarButton>
					<ToolbarButton
						label="重做（Ctrl+Shift+Z）"
						onClick={() => editor.chain().focus().redo().run()}
					>
						↷
					</ToolbarButton>
				</div>
				<span className="blog-editor-toolbar-sep" aria-hidden="true" />
				<div className="blog-editor-toolbar-group" role="group" aria-label="段落样式">
					<ToolbarButton
						label="二级标题"
						active={editor.isActive('heading', { level: 2 })}
						onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
					>
						H2
					</ToolbarButton>
					<ToolbarButton
						label="三级标题"
						active={editor.isActive('heading', { level: 3 })}
						onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
					>
						H3
					</ToolbarButton>
					<ToolbarButton
						label="正文"
						active={editor.isActive('paragraph')}
						onClick={() => editor.chain().focus().setParagraph().run()}
					>
						¶
					</ToolbarButton>
				</div>
				<span className="blog-editor-toolbar-sep" aria-hidden="true" />
				<div className="blog-editor-toolbar-group" role="group" aria-label="文字格式">
					<ToolbarButton
						label="粗体（Ctrl+B）"
						active={editor.isActive('bold')}
						onClick={() => editor.chain().focus().toggleBold().run()}
					>
						<strong>B</strong>
					</ToolbarButton>
					<ToolbarButton
						label="斜体（Ctrl+I）"
						active={editor.isActive('italic')}
						onClick={() => editor.chain().focus().toggleItalic().run()}
					>
						<em>I</em>
					</ToolbarButton>
					<ToolbarButton
						label="下划线（Ctrl+U）"
						active={editor.isActive('underline')}
						onClick={() => editor.chain().focus().toggleUnderline().run()}
					>
						<u>U</u>
					</ToolbarButton>
					<ToolbarButton
						label="删除线"
						active={editor.isActive('strike')}
						onClick={() => editor.chain().focus().toggleStrike().run()}
					>
						<s>S</s>
					</ToolbarButton>
					<ToolbarButton
						label="行内代码"
						active={editor.isActive('code')}
						onClick={() => editor.chain().focus().toggleCode().run()}
					>
						{'<>'}
					</ToolbarButton>
				</div>
				<span className="blog-editor-toolbar-sep" aria-hidden="true" />
				<div className="blog-editor-toolbar-group" role="group" aria-label="内容块">
					<ToolbarButton
						label="无序列表"
						active={editor.isActive('bulletList')}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
					>
						•
					</ToolbarButton>
					<ToolbarButton
						label="有序列表"
						active={editor.isActive('orderedList')}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
					>
						1.
					</ToolbarButton>
					<ToolbarButton
						label="待办列表"
						active={editor.isActive('taskList')}
						onClick={() => editor.chain().focus().toggleTaskList().run()}
					>
						☑
					</ToolbarButton>
					<ToolbarButton
						label="引用"
						active={editor.isActive('blockquote')}
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
					>
						❝
					</ToolbarButton>
					<ToolbarButton
						label="代码块"
						active={editor.isActive('codeBlock')}
						onClick={() => editor.chain().focus().toggleCodeBlock().run()}
					>
						{'{ }'}
					</ToolbarButton>
					<ToolbarButton
						label="插入分割线"
						onClick={() => editor.chain().focus().setHorizontalRule().run()}
					>
						—
					</ToolbarButton>
				</div>
				<span className="blog-editor-toolbar-sep" aria-hidden="true" />
				<div className="blog-editor-toolbar-group" role="group" aria-label="插入内容">
					<ToolbarButton
						label={editor.isActive('link') ? '移除链接' : '插入链接（Ctrl+K）'}
						active={editor.isActive('link')}
						onClick={handleLinkButton}
					>
						↗
					</ToolbarButton>
					<ToolbarButton label="上传图片" onClick={() => fileInputRef.current?.click()}>
						▧
					</ToolbarButton>
				</div>
			</div>
			{isLinkEditorOpen && (
				<form className="blog-editor-link-panel" onSubmit={handleLinkSubmit}>
					<label htmlFor="blog-editor-link-input">链接地址</label>
					<input
						id="blog-editor-link-input"
						type="url"
						value={linkValue}
						onChange={(event) => setLinkValue(event.target.value)}
						autoFocus
						placeholder="https://example.com"
						aria-describedby={linkError ? 'blog-editor-link-error' : undefined}
					/>
					<button type="submit" className="btn btn-primary">
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
						<p id="blog-editor-link-error" className="form-error" role="alert">
							{linkError}
						</p>
					)}
				</form>
			)}

			{/* 编辑区 */}
			<div className="blog-editor-body">
				<EditorContent editor={editor} />
			</div>
			{uploadError && (
				<p className="form-error" role="alert" aria-live="polite">
					{uploadError}
				</p>
			)}

			{/* 隐藏的文件输入 */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={handleFileChange}
			/>
		</div>
	);
}
