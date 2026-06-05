/**
 * 发帖表单组件
 *
 * 功能：
 * - textarea 输入框，带字数统计
 * - 可见度选择（7 级）
 * - 图片上传（点击、拖拽、粘贴，最多 9 张）
 * - 上传进度条（XMLHttpRequest 追踪上传进度）
 * - Emoji 选择器（分类浏览，点击插入光标位置）
 * - 草稿自动保存/恢复（localStorage，1 秒防抖）
 * - 提交到 POST /api/posts，成功后跳转到帖子详情页
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';
import EmojiPicker from './EmojiPicker';

/** 已上传文件的信息 */
interface UploadedFile {
	/** FileStorage 记录 ID */
	id: string;
	/** 文件访问 URL */
	url: string;
	/** 文件类型 */
	fileType: string;
	/** 原始文件名 */
	originalName: string;
}

/** 草稿存储键 */
const DRAFT_KEY = 'post-draft';
/** 草稿自动保存间隔（毫秒） */
const DRAFT_SAVE_DELAY = 1000;

interface Props {
	/** 是否在挂载时恢复草稿（仅弹窗模式需要） */
	restoreDraft?: boolean;
}

/**
 * 发帖表单组件
 *
 * 支持全局弹窗场景。草稿通过 localStorage 持久化，
 * 仅在 restoreDraft=true 时（弹窗模式）自动恢复草稿内容。
 * 图片上传支持点击选择、拖拽和剪贴板粘贴三种方式。
 *
 * @param restoreDraft - 是否在挂载时恢复草稿，默认 false
 * @returns 发帖表单 JSX
 */
export default function PostEditor({ restoreDraft = false }: Props) {
	const [content, setContent] = useState('');
	const [visibility, setVisibility] = useState('public');
	const [postPassword, setPostPassword] = useState('');
	const [allowedUsernames, setAllowedUsernames] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
	const [uploading, setUploading] = useState(false);
	/** 上传进度百分比（0-100） */
	const [uploadProgress, setUploadProgress] = useState(0);
	/** Emoji 选择器是否展开 */
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	/** 是否显示了草稿恢复提示 */
	const [draftRestored, setDraftRestored] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	/** textarea 引用，用于 emoji 插入时定位光标 */
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	/** 草稿自动保存定时器 */
	const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** beforeunload 事件处理器引用，用于提交成功后移除 */
	const beforeUnloadRef = useRef<(() => void) | null>(null);

	/** 图片最大数量 */
	const MAX_IMAGES = 9;

	/** 当前已上传图片数量 */
	const imageCount = uploadedFiles.filter((f) => f.fileType === 'image').length;

	/** 是否还能添加图片 */
	const canAddImage = imageCount < MAX_IMAGES;

	// ===== 草稿功能 =====

	/** 保存草稿到 localStorage */
	const saveDraft = useCallback(() => {
		const draft = { content, visibility };
		if (content.trim()) {
			localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
		} else {
			localStorage.removeItem(DRAFT_KEY);
		}
	}, [content, visibility]);

	/** 自动保存草稿（防抖，内容变化 1 秒后保存） */
	useEffect(() => {
		if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
		draftTimerRef.current = setTimeout(saveDraft, DRAFT_SAVE_DELAY);
		return () => {
			if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
		};
	}, [saveDraft]);

	/** 页面关闭前保存草稿 */
	useEffect(() => {
		const handleBeforeUnload = () => saveDraft();
		beforeUnloadRef.current = handleBeforeUnload;
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			beforeUnloadRef.current = null;
		};
	}, [saveDraft]);

	/** 挂载时恢复草稿（仅弹窗模式） */
	useEffect(() => {
		if (!restoreDraft) return;
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			if (saved) {
				const draft = JSON.parse(saved);
				if (draft.content) {
					setContent(draft.content);
					if (draft.visibility) setVisibility(draft.visibility);
					setDraftRestored(true);
					// 3 秒后隐藏提示
					setTimeout(() => setDraftRestored(false), 3000);
				}
			}
		} catch {
			// 草稿解析失败，忽略
		}
	}, [restoreDraft]);

	/** 清除草稿 */
	const clearDraft = useCallback(() => {
		localStorage.removeItem(DRAFT_KEY);
	}, []);

	// ===== 图片上传 =====

	/**
	 * 上传文件到服务器（带进度追踪）
	 *
	 * 使用 XMLHttpRequest 替代 fetch，以支持 upload.progress 事件，
	 * 从而实现上传进度条。
	 *
	 * @param file - 要上传的 File 对象
	 */
	function uploadFile(file: File) {
		const token = localStorage.getItem('token');
		const formData = new FormData();
		formData.append('file', file);
		formData.append('fileType', 'image');

		return new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/upload');
			if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

			// 追踪上传进度
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) {
					setUploadProgress(Math.round((e.loaded / e.total) * 100));
				}
			};

			xhr.onload = () => {
				try {
					const data = JSON.parse(xhr.responseText);
					if (data.success) {
						setUploadedFiles((prev) => [...prev, data.data]);
						resolve();
					} else {
						setError(data.error?.message || '上传失败');
						reject(new Error(data.error?.message));
					}
				} catch {
					setError('上传失败');
					reject(new Error('解析响应失败'));
				}
			};

			xhr.onerror = () => {
				setError('上传失败，请稍后重试');
				reject(new Error('网络错误'));
			};

			xhr.send(formData);
		});
	}

	/**
	 * 批量上传图片的通用逻辑
	 *
	 * @param files - 待上传的图片文件列表
	 */
	function uploadImages(files: File[]) {
		const remaining = MAX_IMAGES - imageCount;
		const imageFiles = files.slice(0, remaining);
		if (imageFiles.length === 0) {
			setError(`图片最多 ${MAX_IMAGES} 张`);
			return;
		}
		setError('');
		setUploading(true);
		setUploadProgress(0);
		Promise.all(imageFiles.map((f) => uploadFile(f))).finally(() => {
			setUploading(false);
			setUploadProgress(0);
		});
	}

	/**
	 * 处理文件选择事件
	 *
	 * @param e - 文件输入变化事件
	 */
	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files;
		if (!files) return;
		uploadImages(Array.from(files));
		// 重置 input 以允许重复选择同一文件
		if (fileInputRef.current) fileInputRef.current.value = '';
	}

	/**
	 * 处理拖拽上传
	 *
	 * @param e - 拖拽事件
	 */
	function handleDrop(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault();
		const files = e.dataTransfer.files;
		if (!files) return;
		const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
		uploadImages(imageFiles);
	}

	/**
	 * 阻止拖拽默认行为
	 *
	 * @param e - 拖拽事件
	 */
	function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault();
	}

	/**
	 * 处理粘贴上传
	 *
	 * 监听 textarea 的 paste 事件，提取剪贴板中的图片文件并上传。
	 * 支持截图粘贴和复制图片粘贴。
	 *
	 * @param e - 剪贴板事件
	 */
	function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
		const items = e.clipboardData?.items;
		if (!items) return;

		const imageFiles: File[] = [];
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				const file = items[i].getAsFile();
				if (file) imageFiles.push(file);
			}
		}

		if (imageFiles.length > 0) {
			uploadImages(imageFiles);
		}
	}

	/**
	 * 删除已上传的图片
	 *
	 * @param id - 文件存储 ID
	 */
	function removeFile(id: string) {
		setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
	}

	// ===== 表单提交 =====

	/**
	 * 处理表单提交
	 *
	 * @param e - 表单事件
	 */
	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();
		setError('');

		// 前端基础校验
		if (!content.trim()) {
			setError('请输入帖子内容');
			return;
		}

		if (content.length > POST_CONTENT_MAX_LENGTH) {
			setError(`内容不能超过 ${POST_CONTENT_MAX_LENGTH} 个字符`);
			return;
		}

		// 可见度相关校验
		if (visibility === 'password' && !postPassword.trim()) {
			setError('请设置帖子访问密码');
			return;
		}

		if (visibility === 'users' && !allowedUsernames.trim()) {
			setError('请输入允许查看的用户名');
			return;
		}

		setLoading(true);

		try {
			// 优先从 localStorage 获取 token，不存在时依赖 cookie 认证
			const token = localStorage.getItem('token');

			// 构建请求体，包含 mediaIds 和可见度相关字段
			const mediaIds = uploadedFiles.map((f) => f.id);
			const requestBody: Record<string, unknown> = {
				content: content.trim(),
				visibility,
				mediaIds
			};

			// visibility=password 时，添加密码
			if (visibility === 'password') {
				requestBody.password = postPassword.trim();
			}

			// visibility=users 时，查询用户名对应的用户 ID
			if (visibility === 'users') {
				const usernames = allowedUsernames
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				// 通过 API 查询用户 ID
				const searchRes = await fetch(
					`/api/users/search?usernames=${encodeURIComponent(usernames.join(','))}`,
					{
						headers: token ? { Authorization: `Bearer ${token}` } : undefined
					}
				);
				const searchData = await searchRes.json();
				if (searchData.success && searchData.data?.items?.length > 0) {
					requestBody.allowedUserIds = searchData.data.items.map(
						(u: { id: string }) => u.id
					);
				} else {
					setError('未找到指定用户');
					setLoading(false);
					return;
				}
			}

			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {})
				},
				body: JSON.stringify(requestBody)
			});

			const data = await res.json();

			if (!data.success) {
				// 服务端返回 401 时提示登录
				if (res.status === 401) {
					setError('请先登录');
				} else {
					setError(data.error?.message || '发布失败');
				}
				return;
			}

			// 发布成功，清除草稿
			// 先移除 beforeunload 监听器，防止页面跳转时触发自动保存重新写入草稿
			if (beforeUnloadRef.current) {
				window.removeEventListener('beforeunload', beforeUnloadRef.current);
			}
			clearDraft();

			// 跳转到帖子详情页
			const post = data.data;
			window.location.href = `/${post.user.username}/${post.id}`;
		} catch {
			setError('网络错误，请稍后重试');
		} finally {
			setLoading(false);
		}
	}

	// ===== Emoji 选择器 =====

	/**
	 * 插入 emoji 到 textarea 光标位置
	 *
	 * 保持光标在 emoji 之后，并重新聚焦 textarea。
	 *
	 * @param emoji - 要插入的 emoji 字符
	 */
	function handleEmojiSelect(emoji: string) {
		const textarea = textareaRef.current;
		if (!textarea) {
			// 无法获取 textarea 引用时，追加到末尾
			setContent((prev) => prev + emoji);
			return;
		}

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const newContent = content.slice(0, start) + emoji + content.slice(end);
		setContent(newContent);

		// 恢复光标位置到 emoji 之后
		requestAnimationFrame(() => {
			textarea.selectionStart = start + emoji.length;
			textarea.selectionEnd = start + emoji.length;
			textarea.focus();
		});
	}

	return (
		<form onSubmit={handleSubmit} className="post-editor">
			{/* 草稿恢复提示 */}
			{draftRestored && (
				<div className="post-editor-draft-hint">📝 已恢复上次未发布的草稿</div>
			)}

			<div className="form-group">
				<textarea
					ref={textareaRef}
					className="form-input post-editor-textarea"
					placeholder="分享你的想法..."
					value={content}
					onChange={(e) => setContent(e.target.value)}
					onPaste={handlePaste}
					maxLength={POST_CONTENT_MAX_LENGTH}
					rows={4}
				/>

				{/* 可见度选择器 */}
				<div className="post-editor-visibility">
					<select
						className="form-input post-editor-visibility-select"
						value={visibility}
						onChange={(e) => setVisibility(e.target.value)}
					>
						<option value="public">🌐 公开</option>
						<option value="logged_in">🔐 登录用户可见</option>
						<option value="followers">👥 粉丝可见</option>
						<option value="following">🤝 我关注的人可见</option>
						<option value="private">🔒 仅自己可见</option>
						<option value="password">🔑 密码保护</option>
						<option value="users">👤 指定用户可见</option>
					</select>
				</div>

				{/* 密码输入框（visibility=password 时显示） */}
				{visibility === 'password' && (
					<div className="post-editor-password">
						<input
							type="password"
							className="form-input"
							placeholder="设置访问密码..."
							value={postPassword}
							onChange={(e) => setPostPassword(e.target.value)}
						/>
					</div>
				)}

				{/* 用户名输入框（visibility=users 时显示） */}
				{visibility === 'users' && (
					<div className="post-editor-users">
						<input
							type="text"
							className="form-input"
							placeholder="输入用户名，逗号分隔（如：alice,bob）"
							value={allowedUsernames}
							onChange={(e) => setAllowedUsernames(e.target.value)}
						/>
					</div>
				)}

				{/* 工具栏：图片上传 + Emoji */}
				<div className="post-editor-toolbar">
					<div className="post-editor-toolbar-actions">
						<div
							className="post-editor-upload"
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onClick={() => fileInputRef.current?.click()}
							role="button"
							tabIndex={0}
							aria-label="点击或拖拽上传图片"
							onKeyDown={(e) => {
								// 键盘可达性：Enter/空格触发文件选择
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									fileInputRef.current?.click();
								}
							}}
						>
							{canAddImage && (
								<label
									className="post-editor-upload-btn"
									// 阻止冒泡，避免 label 触发 input 后再次触发 div.onClick 导致重复打开
									onClick={(e) => e.stopPropagation()}
								>
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										multiple
										onChange={handleFileChange}
										style={{ display: 'none' }}
									/>
									📷 图片
								</label>
							)}
						</div>
						<button
							type="button"
							className="post-editor-emoji-btn"
							onClick={() => setShowEmojiPicker(!showEmojiPicker)}
							aria-label="选择表情"
							aria-expanded={showEmojiPicker}
						>
							😊
						</button>
					</div>
					<span className="post-editor-upload-count">
						{imageCount}/{MAX_IMAGES}
					</span>
				</div>

				{/* 上传进度条 */}
				{uploading && (
					<div className="post-editor-progress">
						<div
							className="post-editor-progress-bar"
							style={{ width: `${uploadProgress}%` }}
						/>
					</div>
				)}

				{/* Emoji 选择器 */}
				{showEmojiPicker && (
					<EmojiPicker
						onSelect={handleEmojiSelect}
						onClose={() => setShowEmojiPicker(false)}
					/>
				)}

				{/* 图片预览 */}
				{uploadedFiles.length > 0 && (
					<div className="post-editor-previews">
						{uploadedFiles.map((file) => (
							<div key={file.id} className="post-editor-preview-item">
								<img src={file.url} alt={file.originalName} />
								<button
									type="button"
									className="post-editor-preview-remove"
									onClick={() => removeFile(file.id)}
								>
									×
								</button>
							</div>
						))}
					</div>
				)}

				<div className="post-editor-footer">
					<span
						className={`post-editor-count ${content.length > POST_CONTENT_MAX_LENGTH * 0.9 ? 'text-danger' : ''}`}
					>
						{content.length}/{POST_CONTENT_MAX_LENGTH}
					</span>
					<button
						className="btn btn-primary"
						type="submit"
						disabled={loading || !content.trim()}
					>
						{loading ? '发布中...' : '发布'}
					</button>
				</div>
			</div>
			{error && <p className="form-error">{error}</p>}
		</form>
	);
}
