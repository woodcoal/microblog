/** 浏览器媒体上传客户端：保留同源 Cookie 与同步器 CSRF 令牌。 */
export type MediaUploadType = 'image' | 'video' | 'attachment';

export interface MediaUploadResult {
	id: string;
	fileStorageId: string;
	reservationId: string;
	expiresAt: string;
	previewUrl: string;
	url: string;
	displayUrl: string;
	originalUrl: string | null;
	fileType: string;
	originalName: string;
	fileSize: number;
}

type UploadSuccess = { success: true; data: MediaUploadResult };
type UploadFailure = { success: false; error?: { message?: string } };

function csrfToken(): string {
	return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

function isUploadSuccess(value: unknown): value is UploadSuccess {
	return (
		typeof value === 'object' &&
		value !== null &&
		'success' in value &&
		value.success === true &&
		'data' in value
	);
}

function errorMessage(value: unknown): string {
	if (
		typeof value === 'object' &&
		value !== null &&
		'success' in value &&
		value.success === false
	) {
		const error = (value as UploadFailure).error;
		if (typeof error?.message === 'string' && error.message) return error.message;
	}
	return '上传失败，请重试';
}

/** 向运行期 `/api/upload` 发送 multipart 请求。 */
export async function uploadMedia(
	file: File,
	fileType: MediaUploadType
): Promise<MediaUploadResult> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('fileType', fileType);
	const response = await fetch('/api/upload', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'X-CSRF-Token': csrfToken() },
		body: formData
	});
	const body: unknown = await response.json().catch(() => null);
	if (response.ok && isUploadSuccess(body)) return body.data;
	throw new Error(errorMessage(body));
}
