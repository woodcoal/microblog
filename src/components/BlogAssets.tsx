import { actions } from 'astro:actions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeEvent } from 'react';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 100 * 1024 * 1024;
const ATTACHMENT_ACCEPT = '.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rar,.7z';

export interface BlogAsset {
	fileStorageId: string;
	mediaId?: string;
	originalName: string;
	fileSize: number;
	previewUrl?: string;
	reservationId?: string;
}

export interface BlogAssetValues {
	thumbnailFileStorageId: string | null;
	attachmentFileStorageIds: string[];
}

interface BlogAssetsProps {
	initialThumbnail?: BlogAsset | null;
	initialAttachments?: BlogAsset[];
	onChange: (values: BlogAssetValues) => void;
	/** 右侧发布设置中的资源面板挂载点；缺省时保留在编辑器内。 */
	containerId?: string;
}

interface UploadResponse {
	id: string;
	fileStorageId: string;
	reservationId: string;
	previewUrl: string;
	fileType: string;
	originalName: string;
	fileSize: number;
}

function formatSize(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isAllowedAttachment(file: File): boolean {
	const extension = file.name.split('.').pop()?.toLowerCase();
	return !!extension && ATTACHMENT_ACCEPT.split(',').some((item) => item.slice(1) === extension);
}

async function uploadAsset(file: File, fileType: 'image' | 'attachment'): Promise<BlogAsset> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('fileType', fileType);
	const result = await actions.uploadMedia(formData);
	if (!result.data) throw new Error(result.error?.message || '上传失败，请重试');
	const upload = result.data as UploadResponse;
	return {
		fileStorageId: upload.fileStorageId,
		originalName: upload.originalName,
		fileSize: upload.fileSize,
		previewUrl: upload.previewUrl,
		reservationId: upload.reservationId
	};
}

/** 博客缩略图和附件的 reservation 生命周期与可访问交互。 */
export default function BlogAssets({
	initialThumbnail = null,
	initialAttachments = [],
	onChange,
	containerId
}: BlogAssetsProps) {
	const [thumbnail, setThumbnail] = useState<BlogAsset | null>(initialThumbnail);
	const [attachments, setAttachments] = useState<BlogAsset[]>(initialAttachments);
	const [uploading, setUploading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const thumbnailInputRef = useRef<HTMLInputElement>(null);
	const attachmentInputRef = useRef<HTMLInputElement>(null);
	const assetsRef = useRef({ thumbnail, attachments });
	const [container, setContainer] = useState<HTMLElement | null>(null);

	useEffect(() => {
		setContainer(containerId ? document.getElementById(containerId) : null);
	}, [containerId]);

	useEffect(() => {
		assetsRef.current = { thumbnail, attachments };
		onChange({
			thumbnailFileStorageId: thumbnail?.fileStorageId ?? null,
			attachmentFileStorageIds: attachments.map((asset) => asset.fileStorageId)
		});
	}, [attachments, onChange, thumbnail]);

	useEffect(() => {
		return () => {
			const abandoned = [
				assetsRef.current.thumbnail,
				...assetsRef.current.attachments
			].filter((asset): asset is BlogAsset => Boolean(asset?.reservationId));
			for (const asset of abandoned) {
				void actions.cancelUpload({ reservationId: asset.reservationId! });
			}
		};
	}, []);

	const cancelReservation = useCallback(async (asset: BlogAsset): Promise<boolean> => {
		if (!asset.reservationId) return true;
		const result = await actions.cancelUpload({ reservationId: asset.reservationId });
		if (result.error) {
			setError(result.error.message || `无法取消“${asset.originalName}”的上传凭证`);
			return false;
		}
		return true;
	}, []);

	const handleThumbnailChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = '';
			if (!file) return;
			if (!file.type.startsWith('image/')) {
				setError('缩略图必须是图片文件。');
				return;
			}

			setError(null);
			setNotice(null);
			setUploading('thumbnail');
			try {
				const next = await uploadAsset(file, 'image');
				if (thumbnail && !(await cancelReservation(thumbnail))) {
					await cancelReservation(next);
					return;
				}
				setThumbnail(next);
				setNotice(thumbnail ? '已替换缩略图。' : '已添加缩略图。');
			} catch (uploadError) {
				setError(
					uploadError instanceof Error ? uploadError.message : '缩略图上传失败，请重试。'
				);
			} finally {
				setUploading(null);
			}
		},
		[cancelReservation, thumbnail]
	);

	const removeThumbnail = useCallback(async () => {
		if (!thumbnail) return;
		setError(null);
		if (!(await cancelReservation(thumbnail))) return;
		setThumbnail(null);
		setNotice('已移除缩略图。');
	}, [cancelReservation, thumbnail]);

	const handleAttachmentChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const selected = Array.from(event.target.files || []);
			event.target.value = '';
			if (!selected.length) return;
			const remaining = MAX_ATTACHMENTS - attachments.length;
			if (remaining <= 0) {
				setError(`附件最多 ${MAX_ATTACHMENTS} 个，请先移除一个附件。`);
				return;
			}
			const files = selected.slice(0, remaining);
			if (selected.length > files.length) {
				setNotice(`一次最多添加 ${remaining} 个附件，其余文件未上传。`);
			}
			const invalid = files.find((file) => !isAllowedAttachment(file));
			if (invalid) {
				setError(`“${invalid.name}”不是支持的附件类型。`);
				return;
			}
			const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
			if (oversized) {
				setError(`“${oversized.name}”超过单附件 20 MB 限制。`);
				return;
			}
			const total =
				attachments.reduce((sum, asset) => sum + asset.fileSize, 0) +
				files.reduce((sum, file) => sum + file.size, 0);
			if (total > MAX_TOTAL_ATTACHMENT_SIZE) {
				setError('附件总大小不能超过 100 MB。');
				return;
			}

			setError(null);
			setUploading('attachments');
			const uploaded: BlogAsset[] = [];
			try {
				for (const file of files) uploaded.push(await uploadAsset(file, 'attachment'));
				setAttachments((current) => [...current, ...uploaded]);
				setNotice(`已添加 ${uploaded.length} 个附件。`);
			} catch (uploadError) {
				for (const asset of uploaded) await cancelReservation(asset);
				setError(
					uploadError instanceof Error ? uploadError.message : '附件上传失败，请重试。'
				);
			} finally {
				setUploading(null);
			}
		},
		[attachments, cancelReservation]
	);

	const removeAttachment = useCallback(
		async (index: number) => {
			const asset = attachments[index];
			if (!asset) return;
			setError(null);
			if (!(await cancelReservation(asset))) return;
			setAttachments((current) => current.filter((_, assetIndex) => assetIndex !== index));
			setNotice(`已移除附件“${asset.originalName}”。`);
		},
		[attachments, cancelReservation]
	);

	const moveAttachment = useCallback((index: number, offset: -1 | 1) => {
		setAttachments((current) => {
			const target = index + offset;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	}, []);

	const attachmentSize = attachments.reduce((sum, asset) => sum + asset.fileSize, 0);
	const content = (
		<section className="blog-assets" aria-labelledby="blog-assets-title">
			<div className="blog-assets-heading">
				<h2 id="blog-assets-title">文章资源</h2>
				<p>缩略图限 1 张；附件最多 10 个，单个不超过 20 MB、合计不超过 100 MB。</p>
			</div>
			<div className="blog-assets-grid">
				<section className="blog-asset-section" aria-labelledby="blog-thumbnail-title">
					<h3 id="blog-thumbnail-title">缩略图</h3>
					{thumbnail ? (
						<div className="blog-thumbnail-preview">
							<img src={thumbnail.previewUrl || ''} alt="文章缩略图预览" />
							<div>
								<p>{thumbnail.originalName}</p>
								<div className="blog-asset-actions">
									<button
										type="button"
										className="btn"
										onClick={() => thumbnailInputRef.current?.click()}
										disabled={Boolean(uploading)}
									>
										替换
									</button>
									<button
										type="button"
										className="btn btn-danger"
										onClick={removeThumbnail}
										disabled={Boolean(uploading)}
									>
										移除
									</button>
								</div>
							</div>
						</div>
					) : (
						<button
							type="button"
							className="btn"
							onClick={() => thumbnailInputRef.current?.click()}
							disabled={Boolean(uploading)}
						>
							选择缩略图
						</button>
					)}
					<p className="blog-asset-hint">支持 JPG、PNG、GIF、WebP，单张不超过 5 MB。</p>
					<input
						ref={thumbnailInputRef}
						className="visually-hidden"
						type="file"
						accept="image/jpeg,image/png,image/gif,image/webp"
						onChange={handleThumbnailChange}
						tabIndex={-1}
					/>
				</section>
				<section className="blog-asset-section" aria-labelledby="blog-attachments-title">
					<div className="blog-assets-section-header">
						<h3 id="blog-attachments-title">附件</h3>
						<span>
							{attachments.length}/{MAX_ATTACHMENTS} · {formatSize(attachmentSize)}
						</span>
					</div>
					{attachments.length > 0 && (
						<ol className="blog-attachment-list" aria-label="附件排序">
							{attachments.map((asset, index) => (
								<li key={asset.fileStorageId}>
									<span className="blog-attachment-name">
										{asset.originalName}{' '}
										<small>{formatSize(asset.fileSize)}</small>
									</span>
									<div className="blog-asset-actions">
										<button
											type="button"
											className="btn"
											onClick={() => moveAttachment(index, -1)}
											disabled={index === 0 || Boolean(uploading)}
											aria-label={`将 ${asset.originalName} 上移`}
										>
											上移
										</button>
										<button
											type="button"
											className="btn"
											onClick={() => moveAttachment(index, 1)}
											disabled={
												index === attachments.length - 1 ||
												Boolean(uploading)
											}
											aria-label={`将 ${asset.originalName} 下移`}
										>
											下移
										</button>
										<button
											type="button"
											className="btn btn-danger"
											onClick={() => removeAttachment(index)}
											disabled={Boolean(uploading)}
											aria-label={`移除 ${asset.originalName}`}
										>
											移除
										</button>
									</div>
								</li>
							))}
						</ol>
					)}
					<button
						type="button"
						className="btn"
						onClick={() => attachmentInputRef.current?.click()}
						disabled={Boolean(uploading) || attachments.length >= MAX_ATTACHMENTS}
					>
						添加附件
					</button>
					<p className="blog-asset-hint">
						支持 PDF、ZIP、Office 文档、TXT、CSV、RAR 和
						7Z；服务端会再次校验类型与大小。
					</p>
					<input
						ref={attachmentInputRef}
						className="visually-hidden"
						type="file"
						accept={ATTACHMENT_ACCEPT}
						multiple
						onChange={handleAttachmentChange}
						tabIndex={-1}
					/>
				</section>
			</div>
			{uploading && (
				<div className="blog-asset-uploading" role="status" aria-live="polite">
					<progress aria-label="正在上传文件" />
					正在上传{uploading === 'thumbnail' ? '缩略图' : '附件'}，请稍候…
				</div>
			)}
			{notice && (
				<p className="blog-asset-notice" role="status" aria-live="polite">
					{notice}
				</p>
			)}
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</section>
	);

	return container ? createPortal(content, container) : content;
}
