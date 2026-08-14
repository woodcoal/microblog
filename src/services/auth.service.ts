/**
 * 认证 Service
 *
 * 编排用户注册、登录的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import {
	findUserByEmail,
	findUserById,
	createFirstAdminOrUser,
	createFirstAdminOrAgentUser
} from '@/lib/user';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { countApiTokens } from '@/lib/token';
import { ServiceError } from '@/lib/errors';
import { ALLOW_REGISTRATION, PASSWORD_MIN_LENGTH, DISABLED_USER_MESSAGE } from '@/lib/config';
import { assertValidUsername, generateUsernameCandidate } from '@/lib/username';
import {
	createEmailVerificationTokenDraft,
	scheduleEmailVerificationDelivery
} from '@/lib/email-verification';
import { consumePasswordResetToken, requestPasswordReset } from '@/lib/password-reset';
import { consumeEmailChangeToken, issueEmailChangeToken } from '@/lib/email-change';
import {
	assertEmailOwnershipEnabled,
	isEmailOwnershipEnabled,
	assertUserMayAuthenticate
} from '@/services/email-policy.service';

/** 邮箱格式正则 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_RESPONSE_MINIMUM_MS = 250;

// ── Agent API 专用查询函数 ──

/**
 * 获取用户 API Token 数量
 *
 * 登录成功后查询用户的 API Token 数量，
 * 供 Agent API 层判断用户是否有可用 Token。
 *
 * @param input - { email }
 * @returns 用户 ID 和 Token 数量；用户不存在时返回 null
 */
export async function getUserApiTokenCount(input: {
	email: string;
}): Promise<{ userId: string; tokenCount: number } | null> {
	const user = await findUserByEmail(input.email);
	if (!user || user.isDisabled || user.deletedAt) {
		return null;
	}
	try {
		await assertUserMayAuthenticate(user);
	} catch {
		return null;
	}

	const tokenCount = await countApiTokens(user.id);
	return { userId: user.id, tokenCount };
}

// ── 类型定义 ──

export interface RegisterUserInput {
	username?: string;
	displayName?: string;
	email: string;
	password: string;
}

export interface RegisterUserResult {
	accepted: true;
	/** 提示入口下一步；不包含角色或首位管理员状态。 */
	nextAction: 'verify_email' | 'login';
	/** 仅供服务层内部测试和后续编排使用，HTTP/Astro Action 不得序列化此字段。 */
	user: {
		id: string;
		username: string;
		displayName: string;
		avatarUrl: string | null;
		role: string;
		credentialVersion: number;
	} | null;
}

export interface RegisterAgentUserResult {
	id: string;
	apiKey: string;
}

export interface LoginUserInput {
	email: string;
	password: string;
}

export interface LoginUserResult {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	role: string;
	email: string;
	isDisabled: boolean;
	credentialVersion: number;
}

export async function requestPasswordResetForEmail(email: string): Promise<void> {
	await assertEmailOwnershipEnabled('reset');
	// 即使格式不合法也保持对外成功语义；避免将请求端校验变成探测辅助信息。
	if (!EMAIL_PATTERN.test(email)) return;
	await requestPasswordReset(email);
}

export async function resetPassword(input: { token: string; password: string }): Promise<boolean> {
	await assertEmailOwnershipEnabled('reset');
	if (input.password.length < PASSWORD_MIN_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
	}
	return consumePasswordResetToken(input.token, await hashPassword(input.password));
}

/**
 * 验证当前密码后发起邮箱换绑。确认前不会改动登录邮箱；对于目标邮箱是否存在，
 * 唯一索引会在确认事务中裁决，受理阶段不作可观测的预检。
 */
export async function requestEmailChange(input: {
	userId: string;
	currentPassword: string;
	targetEmail: string;
}): Promise<void> {
	await assertEmailOwnershipEnabled();
	if (!EMAIL_PATTERN.test(input.targetEmail)) {
		throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	}
	const user = await findUserById(input.userId, {
		id: true,
		email: true,
		passwordHash: true,
		isDisabled: true,
		deletedAt: true,
		emailVerifiedAt: true
	});
	if (!user || user.isDisabled || user.deletedAt || !user.emailVerifiedAt) {
		throw new ServiceError('UNAUTHORIZED', '请先登录');
	}
	if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
		throw new ServiceError('UNAUTHORIZED', '当前密码错误');
	}
	// 当前邮箱无需换绑，维持同一受理结果且不生成可被误用的新链接。
	if (user.email === input.targetEmail) return;
	await issueEmailChangeToken({ userId: user.id, targetEmail: input.targetEmail });
}

/** 无效、过期、重放、撤销及唯一性竞争都收敛为 false。 */
export function confirmEmailChange(token: string): Promise<boolean> {
	return assertEmailOwnershipEnabled().then(() => consumeEmailChangeToken(token));
}

// ── 业务函数 ──

/**
 * 注册用户
 *
 * 校验注册开关、邮箱格式、用户名格式、保留词和密码长度。无论邮箱是否已存在，
 * 均执行相同的密码哈希和写入尝试；外层入口只能返回统一的已受理语义，避免枚举。
 */
export async function registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
	const { displayName, email, password } = input;
	const startedAt = performance.now();

	// 检查站点是否开放注册
	if (!ALLOW_REGISTRATION) {
		throw new ServiceError('FORBIDDEN', '注册已关闭');
	}

	// 校验邮箱格式
	if (!EMAIL_PATTERN.test(email)) {
		throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	}

	// 校验密码长度
	if (password.length < PASSWORD_MIN_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
	}

	// 不预检邮箱。预检会让已存在邮箱少走哈希/事务路径，制造可测量的枚举侧信道。
	// 唯一索引是最终裁决者，任何冲突都映射为同一个已受理结果。
	const passwordHash = await hashPassword(password);

	const requestedUsername = input.username?.trim();
	const candidates = requestedUsername ? [assertValidUsername(requestedUsername)] : [];
	// 未指定时在小空间冲突下安全重试；四位无歧义随机后缀的冲突率极低。
	for (let attempt = 0; attempt < 8; attempt++) {
		const username = candidates[attempt] ?? generateUsernameCandidate();
		const verificationToken = createEmailVerificationTokenDraft();
		try {
			const registration = await createFirstAdminOrUserWithRetry(
				{
					username,
					displayName: displayName || username,
					email,
					passwordHash
				},
				verificationToken
			);
			const { user, emailVerificationTokenIssued } = registration;
			if (emailVerificationTokenIssued)
				scheduleEmailVerificationDelivery(user, verificationToken);
			return await completeRegistration(startedAt, {
				accepted: true,
				nextAction: emailVerificationTokenIssued ? 'verify_email' : 'login',
				user: {
					id: user.id,
					username: user.username,
					displayName: user.displayName,
					avatarUrl: user.avatarUrl,
					role: user.role,
					credentialVersion: user.credentialVersion
				}
			});
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
			// 首位管理员竞争失败时先前事务已完整回滚；下轮安全作为普通注册重试。
			if (attempt === 0) continue;
			if (requestedUsername || isEmailUniqueConstraintError(error) || attempt === 7)
				return completeRegistration(startedAt, {
					accepted: true,
					nextAction: (await isEmailOwnershipEnabled()) ? 'verify_email' : 'login',
					user: null
				});
		}
	}
	return completeRegistration(startedAt, {
		accepted: true,
		nextAction: (await isEmailOwnershipEnabled()) ? 'verify_email' : 'login',
		user: null
	});
}

/**
 * Agent 注册不走邮件验证，但与 Web 注册使用同一份输入校验、用户名规则和首管竞争。
 * 唯一冲突被调用方统一映射为 400，避免泄露邮箱或用户名已被占用的具体原因。
 */
export async function registerAgentUser(
	input: RegisterUserInput
): Promise<RegisterAgentUserResult> {
	const { displayName, email, password } = input;
	const startedAt = performance.now();
	if (!ALLOW_REGISTRATION) throw new ServiceError('FORBIDDEN', '注册已关闭');
	if (!EMAIL_PATTERN.test(email)) throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	if (password.length < PASSWORD_MIN_LENGTH)
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);

	const passwordHash = await hashPassword(password);
	const requestedUsername = input.username?.trim();
	const username = requestedUsername
		? assertValidUsername(requestedUsername)
		: generateUsernameCandidate();
	try {
		const registration = await createFirstAdminOrAgentUser({
			username,
			displayName: displayName || username,
			email,
			passwordHash
		});
		await completeRegistration(startedAt, null);
		return { id: registration.user.id, apiKey: registration.token };
	} catch (error) {
		await completeRegistration(startedAt, null);
		if (isUniqueConstraintError(error)) throw new ServiceError('BAD_REQUEST', '无法完成注册');
		throw error;
	}
}

const TRANSACTION_RETRY_LIMIT = 5;

/** MySQL 可报告写冲突或死锁；每次重试都是完整注册事务，不会留下部分记录。 */
async function createFirstAdminOrUserWithRetry(
	data: Parameters<typeof createFirstAdminOrUser>[0],
	verificationToken: Parameters<typeof createFirstAdminOrUser>[1]
) {
	for (let retry = 0; ; retry++) {
		try {
			return await createFirstAdminOrUser(data, verificationToken);
		} catch (error) {
			if (!isRetryableTransactionError(error) || retry >= TRANSACTION_RETRY_LIMIT)
				throw error;
			await new Promise((resolve) => setTimeout(resolve, 10 * (retry + 1)));
		}
	}
}

/** 将常见注册路径收敛到同一最小时长，降低唯一约束分支的可观测差异。 */
async function completeRegistration<T>(startedAt: number, result: T): Promise<T> {
	const remaining = REGISTER_RESPONSE_MINIMUM_MS - (performance.now() - startedAt);
	if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
	return result;
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isEmailUniqueConstraintError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
	const target = (error as { meta?: { target?: unknown } }).meta?.target;
	return Array.isArray(target) && target.some((field) => field === 'email');
}

function isRetryableTransactionError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = 'code' in error ? error.code : undefined;
	const message = error instanceof Error ? error.message : '';
	return (
		code === 'P2034' ||
		message.includes('write conflict or deadlock') ||
		message.toLowerCase().includes('deadlock found')
	);
}

/**
 * 登录用户
 *
 * 校验邮箱密码，使用 dummyHash 防止时序攻击。
 * 返回用户信息（不含密码哈希），由调用方决定如何生成 token。
 */
export async function loginUser(input: LoginUserInput): Promise<LoginUserResult> {
	const { email, password } = input;

	// 查找用户
	const user = await findUserByEmail(email);

	// 无论用户是否存在都执行 bcrypt 比较，防止时序攻击枚举有效邮箱
	const dummyHash = '$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
	const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);

	if (!user || !valid) {
		throw new ServiceError('UNAUTHORIZED', '邮箱或密码错误');
	}

	// 检查用户是否被禁用
	if (user.isDisabled || user.deletedAt) {
		throw new ServiceError('FORBIDDEN', DISABLED_USER_MESSAGE);
	}
	await assertUserMayAuthenticate(user);

	return {
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.avatarUrl,
		role: user.role,
		email: user.email,
		isDisabled: user.isDisabled,
		credentialVersion: user.credentialVersion
	};
}
