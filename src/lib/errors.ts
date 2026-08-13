/**
 * Service 层错误类
 *
 * Service 函数抛出此错误，由 Action/API 层转换为各自的错误格式。
 */

export type ServiceErrorCode =
	| 'NOT_FOUND'
	| 'BAD_REQUEST'
	| 'FORBIDDEN'
	| 'UNAUTHORIZED'
	| 'EMAIL_OWNERSHIP_DISABLED'
	| 'SMTP_CONFIGURATION_INVALID';

export class ServiceError extends Error {
	constructor(
		public code: ServiceErrorCode,
		message: string
	) {
		super(message);
		this.name = 'ServiceError';
	}
}

/** Astro Actions 只接受 HTTP 语义错误码；扩展机器码仍由 JSON/Agent API 保留。 */
export function actionErrorCode(
	code: ServiceErrorCode
): 'NOT_FOUND' | 'BAD_REQUEST' | 'FORBIDDEN' | 'UNAUTHORIZED' {
	return code === 'EMAIL_OWNERSHIP_DISABLED'
		? 'FORBIDDEN'
		: code === 'SMTP_CONFIGURATION_INVALID'
			? 'BAD_REQUEST'
			: code;
}

/** 从未知错误中安全读取 HTTP 状态码。 */
export function getErrorStatus(error: unknown): number | undefined {
	if (
		typeof error === 'object' &&
		error !== null &&
		'status' in error &&
		typeof error.status === 'number'
	) {
		return error.status;
	}
	return undefined;
}

/** 从未知错误中安全读取可展示的消息。 */
export function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}
