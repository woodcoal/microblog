/**
 * Service 层错误类
 *
 * Service 函数抛出此错误，由 Action/API 层转换为各自的错误格式。
 */

export type ServiceErrorCode = 'NOT_FOUND' | 'BAD_REQUEST' | 'FORBIDDEN' | 'UNAUTHORIZED';

export class ServiceError extends Error {
	constructor(
		public code: ServiceErrorCode,
		message: string
	) {
		super(message);
		this.name = 'ServiceError';
	}
}
