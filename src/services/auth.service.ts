/**
 * 认证 Service
 *
 * 编排用户注册、登录的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findUserByEmail, createUserWithUsernameClaim } from '@/lib/user';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { countApiTokens } from '@/lib/token';
import { ServiceError } from '@/lib/errors';
import { ALLOW_REGISTRATION, PASSWORD_MIN_LENGTH, DISABLED_USER_MESSAGE } from '@/lib/config';
import { assertValidUsername, generateUsernameCandidate } from '@/lib/username';
import { issueEmailVerificationToken } from '@/lib/email-verification';

/** 邮箱格式正则 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
	if (!user || !user.emailVerifiedAt) {
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
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	role: string;
	verificationPending: true;
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
}

// ── 业务函数 ──

/**
 * 注册用户
 *
 * 校验注册开关、邮箱格式、用户名格式、保留词、密码长度、唯一性，
 * 哈希密码后创建待验证用户并发起一次性验证邮件。返回信息不含密码哈希与邮箱。
 */
export async function registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
	const { displayName, email, password } = input;

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

	// 预检邮箱，用户名最终由唯一索引的 claim 原子裁决。
	if (await findUserByEmail(email)) {
		throw new ServiceError('BAD_REQUEST', '注册信息已存在，请更换邮箱或用户名');
	}

	// 哈希密码
	const passwordHash = await hashPassword(password);

	const requestedUsername = input.username?.trim();
	const candidates = requestedUsername ? [assertValidUsername(requestedUsername)] : [];
	// 未指定时在小空间冲突下安全重试；四位无歧义随机后缀的冲突率极低。
	for (let attempt = 0; attempt < 8; attempt++) {
		const username = candidates[attempt] ?? generateUsernameCandidate();
		try {
			const user = await createUserWithUsernameClaim({
				username,
				displayName: displayName || username,
				email,
				passwordHash
			});
			await issueEmailVerificationToken(user);
			return {
				id: user.id,
				username: user.username,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
				role: user.role,
				verificationPending: true
			};
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
			if (requestedUsername || attempt === 7)
				throw new ServiceError('BAD_REQUEST', '注册信息已存在，请更换邮箱或用户名');
		}
	}
	throw new ServiceError('BAD_REQUEST', '无法分配用户名，请重试');
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
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
	if (user.isDisabled) {
		throw new ServiceError('FORBIDDEN', DISABLED_USER_MESSAGE);
	}
	if (!user.emailVerifiedAt) {
		throw new ServiceError('FORBIDDEN', '请先完成邮箱验证');
	}

	return {
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.avatarUrl,
		role: user.role,
		email: user.email,
		isDisabled: user.isDisabled
	};
}
