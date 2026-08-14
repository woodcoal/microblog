/** 上传业务规则。请求体大小仅由 API_UPLOAD_BODY_LIMIT_BYTES 控制。 */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;
export const ATTACHMENT_EXTENSIONS = [
	'pdf',
	'zip',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'txt',
	'csv',
	'rar',
	'7z'
] as const;
