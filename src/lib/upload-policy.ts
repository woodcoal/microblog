/** 上传业务规则。它们是产品限制，不是可配置的 HTTP 请求体上限。 */
export const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const VIDEO_MAX_SIZE = 50 * 1024 * 1024;
export const ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

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
