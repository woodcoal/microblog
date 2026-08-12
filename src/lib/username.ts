/** 用户名规则：所有外部入口使用同一小写规范名。 */
import { RESERVED_USERNAMES, USERNAME_PATTERN } from '@/lib/config';
import { ServiceError } from '@/lib/errors';

const GENERATED_USERNAME_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function normalizeUsername(value: string): string {
	return value.trim().toLowerCase();
}

export function assertValidUsername(value: string): string {
	const username = normalizeUsername(value);
	if (!USERNAME_PATTERN.test(username)) {
		throw new ServiceError('BAD_REQUEST', '用户名只能包含字母、数字和下划线，长度 3-20 个字符');
	}
	if (RESERVED_USERNAMES.includes(username)) {
		throw new ServiceError('BAD_REQUEST', '该用户名为系统保留，无法使用');
	}
	return username;
}

/** 生成无歧义的四位随机后缀；实际唯一性由 UsernameClaim 的唯一索引保证。 */
export function generateUsernameCandidate(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(4));
	return `u_${Array.from(bytes, (byte) => GENERATED_USERNAME_ALPHABET[byte % GENERATED_USERNAME_ALPHABET.length]).join('')}`;
}
