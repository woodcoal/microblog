/**
 * 博客编辑器组件（React Island — Tiptap 富文本编辑器）
 *
 * 使用 Tiptap 实现所见即所得编辑体验：
 * - 完整工具栏：标题(H1-H3)、粗体、斜体、删除线、列表(有序/无序)、
 *   引用、代码块、链接、图片、分割线、撤销/重做
 * - 图片上传：点击图片按钮触发文件选择，上传后插入编辑器
 * - Markdown 双向转换：使用 tiptap-markdown 扩展
 * - 提交时通过 tiptap-markdown 将编辑器内容转为 Markdown 字符串
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
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';
import { useCallback, useRef, useState } from 'react';

/** lowlight 实例，用于代码块语法高亮 */
const lowlight = createLowlight(common);

/**
 * 博客编辑器组件属性
 *
 * @property initialContent - 初始 Markdown 内容
 * @property onSubmit - 提交回调函数
 */
interface BlogEditorProps {
	initialContent?: string;
	onSubmit?: (content: string) => void;
}

/**
 * 博客编辑器组件
 *
 * 基于 Tiptap 的所见即所得富文本编辑器。
 * 支持完整 Markdown 语法编辑，提交时输出 Markdown 字符串。
 *
 * @param props - 组件属性
 * @returns 编辑器 JSX
 */
export default function BlogEditor({ initialContent = '', onSubmit }: BlogEditorProps) {
	/** 图片上传文件输入引用 */
	const fileInputRef = useRef<HTMLInputElement>(null);
	/** 加载状态 */
	const [loading, setLoading] = useState(false);

	/** Tiptap 编辑器实例 */
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				codeBlock: false, // 使用 CodeBlockLowlight 替代
				heading: {
					levels: [1, 2, 3]
				}
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
				placeholder: '开始写你的文章...'
			}),
			CodeBlockLowlight.configure({
				lowlight
			}),
			Markdown.configure({
				html: true,
				transformPastedText: true,
				transformCopiedText: true
			})
		],
		content: initialContent,
		editorProps: {
			attributes: {
				class: 'blog-editor-content'
			}
		}
	});

	/**
	 * 处理图片上传
	 *
	 * 点击图片按钮触发文件选择，上传后插入编辑器。
	 */
	const handleImageUpload = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	/**
	 * 文件选择变化时上传图片
	 */
	const handleFileChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files || !editor) return;

			for (const file of Array.from(files)) {
				try {
					// 调用 Astro Actions 上传图片
					const { actions } = await import('astro:actions');
					const result = await actions.uploadMedia({ file, fileType: 'image' });
					if (result.data) {
						editor.chain().focus().setImage({ src: result.data.url }).run();
					}
				} catch {
					// 上传失败静默处理
				}
			}
			// 清空 file input，允许重复选择
			e.target.value = '';
		},
		[editor]
	);

	/**
	 * 监听发布完成事件，重置 loading 状态
	 *
	 * Astro 页面在发布成功或失败后 dispatch 'blog-editor-submit-done' 事件，
	 * BlogEditor 收到后重置 loading，允许再次提交。
	 */
	useEffect(() => {
		const container = document.getElementById('blog-compose-container');
		if (!container) return;
		const handleDone = () => setLoading(false);
		container.addEventListener('blog-editor-submit-done', handleDone);
		return () => container.removeEventListener('blog-editor-submit-done', handleDone);
	}, []);

	/**
	 * 处理链接插入
	 *
	 * 弹出简易输入框获取 URL，在编辑器中插入链接。
	 */
	const handleLinkInsert = useCallback(() => {
		if (!editor) return;
		const url = window.prompt('输入链接 URL:', 'https://');
		if (url) {
			editor.chain().focus().setLink({ href: url }).run();
		}
	}, [editor]);

	/**
	 * 提交编辑器内容
	 *
	 * 将 Tiptap 内容转为 Markdown 字符串，通过自定义事件通知父页面。
	 * 使用 CustomEvent 'blog-editor-submit' 传递内容，方便 Astro 页面监听。
	 */
	const handleSubmit = useCallback(() => {
		if (!editor) return;
		// 通过 tiptap-markdown 获取 Markdown 内容
		const markdown = editor.storage.markdown.getMarkdown();

		// 如果有 onSubmit 回调，直接调用
		if (onSubmit) {
			onSubmit(markdown);
			return;
		}

		// 设置 loading 状态，防止重复提交
		setLoading(true);

		// 否则通过自定义事件通知父页面
		const container = document.getElementById('blog-compose-container');
		if (container) {
			container.dispatchEvent(
				new CustomEvent('blog-editor-submit', {
					detail: markdown,
					bubbles: true
				})
			);
		}
	}, [editor, onSubmit]);

	// 编辑器未就绪时不渲染
	if (!editor) return null;

	/** 当前是否为标题 */
	const isH1 = editor.isActive('heading', { level: 1 });
	const isH2 = editor.isActive('heading', { level: 2 });
	const isH3 = editor.isActive('heading', { level: 3 });

	return (
		<div className="blog-editor">
			{/* 工具栏 */}
			<div className="blog-editor-toolbar">
				<div className="blog-editor-toolbar-group">
					<button
						type="button"
						className={`blog-editor-btn ${isH1 ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
						title="一级标题"
					>
						H1
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${isH2 ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
						title="二级标题"
					>
						H2
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${isH3 ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
						title="三级标题"
					>
						H3
					</button>
				</div>

				<div className="blog-editor-toolbar-sep" />

				<div className="blog-editor-toolbar-group">
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('bold') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleBold().run()}
						title="粗体"
					>
						<strong>B</strong>
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('italic') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleItalic().run()}
						title="斜体"
					>
						<em>I</em>
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('strike') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleStrike().run()}
						title="删除线"
					>
						<s>S</s>
					</button>
				</div>

				<div className="blog-editor-toolbar-sep" />

				<div className="blog-editor-toolbar-group">
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('bulletList') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						title="无序列表"
					>
						• 列表
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('orderedList') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						title="有序列表"
					>
						1. 列表
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('blockquote') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
						title="引用"
					>
						❝ 引用
					</button>
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('codeBlock') ? 'blog-editor-btn-active' : ''}`}
						onClick={() => editor.chain().focus().toggleCodeBlock().run()}
						title="代码块"
					>
						{'<>'}
					</button>
				</div>

				<div className="blog-editor-toolbar-sep" />

				<div className="blog-editor-toolbar-group">
					<button
						type="button"
						className={`blog-editor-btn ${editor.isActive('link') ? 'blog-editor-btn-active' : ''}`}
						onClick={handleLinkInsert}
						title="链接"
					>
						🔗
					</button>
					<button
						type="button"
						className="blog-editor-btn"
						onClick={handleImageUpload}
						title="上传图片"
					>
						📷
					</button>
					<button
						type="button"
						className="blog-editor-btn"
						onClick={() => editor.chain().focus().setHorizontalRule().run()}
						title="分割线"
					>
						—
					</button>
				</div>

				<div className="blog-editor-toolbar-sep" />

				<div className="blog-editor-toolbar-group">
					<button
						type="button"
						className="blog-editor-btn"
						onClick={() => editor.chain().focus().undo().run()}
						disabled={!editor.can().undo()}
						title="撤销"
					>
						↩
					</button>
					<button
						type="button"
						className="blog-editor-btn"
						onClick={() => editor.chain().focus().redo().run()}
						disabled={!editor.can().redo()}
						title="重做"
					>
						↪
					</button>
				</div>
			</div>

			{/* 编辑区域 */}
			<EditorContent editor={editor} />

			{/* 隐藏的文件输入 */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={handleFileChange}
			/>

			{/* 底部提交按钮 */}
			<div className="blog-editor-footer">
				<button
					type="button"
					className="btn btn-primary"
					onClick={handleSubmit}
					disabled={loading}
				>
					{loading ? '发布中...' : '发布文章'}
				</button>
			</div>
		</div>
	);
}
