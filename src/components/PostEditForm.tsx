/**
 * 帖子编辑表单组件
 *
 * 预填充当前内容，提供字数统计、图片/附件管理，
 * 提交到 PUT /api/posts/:id，成功后跳转到帖子详情页。
 */
import { useState, useRef } from 'react';
import { POST_CONTENT_MAX_LENGTH } from '@/lib/config';

/** 已有媒体信息（从服务端传入） */
interface ExistingMedia {
	/** Media 记录 ID */
	id: string;
	/** FileStorage 记录 ID */
	fileStorageId: string;
	/** 文件类型 */
	fileType: string;
	/** 原始文件名 */
	originalName: string;
	/** 文件访问 URL */
	url: string;
}

/** 新上传文件的信息 */
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

/**
 * PostEditForm 组件属性
 *
 * @property postId - 帖子 ID
 * @property initialContent - 当前帖子内容（用于预填充）
 * @property username - 作者用户名（用于跳转）
 * @property initialMedia - 当前帖子的媒体列表
 */
interface PostEditFormProps {
	postId: string;
	initialContent: string;
	username: string;
	initialMedia?: ExistingMedia[];
	initialVisibility?: string;
}

/**
 * 帖子编辑表单组件
 *
 * 功能：
 * - 预填充当前内容
 * - 字数统计
 * - 显示当前图片和附件
 * - 支持增删图片和附件
 * - 提交到 PUT /api/posts/:id
 * - 成功后跳转到帖子详情页
 *
 * @param props - 组件属性
 * @returns 编辑表单 JSX
 */
export default function PostEditForm({
	postId,
	initialContent,
	username,
	initialMedia = [],
	initialVisibility = 'public'
}: PostEditFormProps) {
	const [content, setContent] = useState(initialContent);
	const [visibility, setVisibility] = useState(initialVisibility);
	const [postPassword, setPostPassword] = useState('');
	const [allowedUsernames, setAllowedUsernames] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	// 已有媒体（保留的）
	const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(initialMedia);
	// 新上传的文件
	const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
	const [uploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	/** 图片最大数量 */
	const MAX_IMAGES = 9;

	/** 当前图片总数（已有 + 新增） */
	const imageCount =
		existingMedia.filter((m) => m.fileType === 'image').length +
		newFiles.filter((f) => f.fileType === 'image').length;

	/** 是否还能添加图片 */
	const canAddImage = imageCount < MAX_IMAGES;

	/** 当前附件列表 */
	const attachments = existingMedia.filter((m) => m.fileType === 'attachment');

	/** 当前图片列表 */
	const images = existingMedia.filter((m) => m.fileType === 'image');

	/**
	 * 上传文件到服务器
	 *
	 * @param file - 要上传的 File 对象
	 * @param fileType - 文件类型
	 */
	async function uploadFile(file: File, fileType: 'image' | 'attachment') {
		// 优先从 localStorage 获取 token，不存在时依赖 cookie 认证
		const token = localStorage.getItem('token');

		const formData = new FormData();
		formData.append('file', file);
		formData.append('fileType', fileType);

		try {
			const res = await fetch('/api/upload', {
				method: 'POST',
				headers: token ? { Authorization: `Bearer ${token}` } : undefined,
				body: formData
			});

			const data = await res.json();
			if (!data.success) {
				setError(data.error?.message || '上传失败');
				return;
			}

			setNewFiles((prev) => [...prev, data.data]);
		} catch {
			setError('上传失败，请稍后重试');
		}
	}

	/**
	 * 处理文件选择事件
	 *
	 * @param e - 文件输入变化事件
	 */
	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files;
		if (!files) return;

		const remaining = MAX_IMAGES - imageCount;
		const imageFiles = Array.from(files).slice(0, remaining);

		if (imageFiles.length === 0) {
			setError(`图片最多 ${MAX_IMAGES} 张`);
			return;
		}

		setError('');
		setUploading(true);

		Promise.all(imageFiles.map((f) => uploadFile(f, 'image'))).finally(() => {
			setUploading(false);
		});

		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	}

	/**
	 * 处理附件上传
	 *
	 * @param e - 文件输入变化事件
	 */
	function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = e.target.files;
		if (!files) return;

		setError('');
		setUploading(true);

		Promise.all(Array.from(files).map((f) => uploadFile(f, 'attachment'))).finally(() => {
			setUploading(false);
		});
	}

	/**
	 * 删除已有的媒体
	 *
	 * @param id - Media 记录 ID
	 */
	function removeExistingMedia(id: string) {
		setExistingMedia((prev) => prev.filter((m) => m.id !== id));
	}

	/**
	 * 删除新上传的文件
	 *
	 * @param id - FileStorage 记录 ID
	 */
	function removeNewFile(id: string) {
		setNewFiles((prev) => prev.filter((f) => f.id !== id));
	}

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

			// 合并已有媒体和新上传文件的 fileStorageId
			const mediaIds = [
				...existingMedia.map((m) => m.fileStorageId),
				...newFiles.map((f) => f.id)
			];

			// 构建请求体
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

			const res = await fetch(`/api/posts/${postId}`, {
				method: 'PUT',
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
					setError(data.error?.message || '编辑失败');
				}
				return;
			}

			// 编辑成功，跳转到帖子详情页
			window.location.href = `/${username}/${postId}`;
		} catch {
			setError('网络错误，请稍后重试');
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="post-edit-form">
			<div className="form-group">
				<textarea
					className="form-input post-edit-textarea"
					placeholder="编辑你的帖子..."
					value={content}
					onChange={(e) => setContent(e.target.value)}
					maxLength={POST_CONTENT_MAX_LENGTH}
					rows={6}
				/>

				{/* 可见度选择器 */}
				<div className="post-edit-visibility">
					<select
						className="form-input post-edit-visibility-select"
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
					<div className="post-edit-password-field">
						<input
							type="password"
							className="form-input"
							placeholder="设置新密码（留空则保持原密码）..."
							value={postPassword}
							onChange={(e) => setPostPassword(e.target.value)}
						/>
					</div>
				)}

				{/* 用户名输入框（visibility=users 时显示） */}
				{visibility === 'users' && (
					<div className="post-edit-users-field">
						<input
							type="text"
							className="form-input"
							placeholder="输入用户名，逗号分隔（如：alice,bob）"
							value={allowedUsernames}
							onChange={(e) => setAllowedUsernames(e.target.value)}
						/>
					</div>
				)}

				{/* 当前图片 */}
				{images.length > 0 && (
					<div className="post-edit-section">
						<h4 className="post-edit-section-title">当前图片</h4>
						<div className="post-edit-previews">
							{images.map((media) => (
								<div key={media.id} className="post-edit-preview-item">
									<img src={media.url} alt={media.originalName} />
									<button
										type="button"
										className="post-edit-preview-remove"
										onClick={() => removeExistingMedia(media.id)}
									>
										×
									</button>
								</div>
							))}
						</div>
					</div>
				)}

				{/* 新上传的图片 */}
				{newFiles.length > 0 && (
					<div className="post-edit-section">
						<h4 className="post-edit-section-title">新增图片</h4>
						<div className="post-edit-previews">
							{newFiles.map((file) => (
								<div key={file.id} className="post-edit-preview-item">
									<img src={file.url} alt={file.originalName} />
									<button
										type="button"
										className="post-edit-preview-remove"
										onClick={() => removeNewFile(file.id)}
									>
										×
									</button>
								</div>
							))}
						</div>
					</div>
				)}

				{/* 当前附件 */}
				{attachments.length > 0 && (
					<div className="post-edit-section">
						<h4 className="post-edit-section-title">当前附件</h4>
						<div className="post-edit-attachments">
							{attachments.map((media) => (
								<div key={media.id} className="post-edit-attachment-item">
									<span>📎 {media.originalName}</span>
									<button
										type="button"
										className="post-edit-attachment-remove"
										onClick={() => removeExistingMedia(media.id)}
									>
										删除
									</button>
								</div>
							))}
						</div>
					</div>
				)}

				{/* 上传按钮 */}
				<div className="post-edit-upload" role="button" aria-label="拖拽或点击上传文件">
					{canAddImage && (
						<label className="post-edit-upload-btn">
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								multiple
								onChange={handleFileChange}
								style={{ display: 'none' }}
							/>
							{uploading ? '上传中...' : '📷 添加图片'}
						</label>
					)}
					<label className="post-edit-upload-btn">
						<input
							type="file"
							accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rar,.7z"
							multiple
							onChange={handleAttachmentChange}
							style={{ display: 'none' }}
						/>
						📎 添加附件
					</label>
					<span className="post-edit-upload-count">
						图片 {imageCount}/{MAX_IMAGES}
					</span>
				</div>

				<div className="post-edit-footer">
					<span
						className={`post-edit-count ${content.length > POST_CONTENT_MAX_LENGTH * 0.9 ? 'text-danger' : ''}`}
					>
						{content.length}/{POST_CONTENT_MAX_LENGTH}
					</span>
					<div className="post-edit-actions">
						<a href={`/${username}/${postId}`} className="btn btn-outline">
							取消
						</a>
						<button
							className="btn btn-primary"
							type="submit"
							disabled={loading || !content.trim()}
						>
							{loading ? '保存中...' : '保存修改'}
						</button>
					</div>
				</div>
			</div>
			{error && <p className="form-error">{error}</p>}
		</form>
	);
}
