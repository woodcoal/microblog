/**
 * 认证 Service
 *
 * 编排用户注册、登录的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findUserByEmail, findUserByUsername, createUser } from '@/lib/user';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { countApiTokens } from '@/lib/token';
import { ServiceError } from '@/lib/errors';
import {
	ALLOW_REGISTRATION,
	USERNAME_PATTERN,
	PASSWORD_MIN_LENGTH,
	RESERVED_USERNAMES,
	DISABLED_USER_MESSAGE
} from '@/lib/config';

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
	if (!user) {
		return null;
	}

	const tokenCount = await countApiTokens(user.id);
	return { userId: user.id, tokenCount };
}

// ── 类型定义 ──

export interface RegisterUserInput {
	username: string;
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
	email: string;
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
 * 哈希密码后创建用户。返回创建的用户信息（不含密码哈希）。
 */
export async function registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
	const { username, displayName, email, password } = input;

	// 检查站点是否开放注册
	if (!ALLOW_REGISTRATION) {
		throw new ServiceError('FORBIDDEN', '注册已关闭');
	}

	// 校验邮箱格式
	if (!EMAIL_PATTERN.test(email)) {
		throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	}

	// 校验用户名格式
	if (!USERNAME_PATTERN.test(username)) {
		throw new ServiceError('BAD_REQUEST', '用户名只能包含字母、数字和下划线，长度 3-20 个字符');
	}

	// 校验保留用户名
	if (
		RESERVED_USERNAMES.includes(username.toLowerCase() as (typeof RESERVED_USERNAMES)[number])
	) {
		throw new ServiceError('BAD_REQUEST', '该用户名为系统保留，无法使用');
	}

	// 校验密码长度
	if (password.length < PASSWORD_MIN_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
	}

	// 检查邮箱和用户名是否已存在（合并提示，防止枚举攻击）
	const [existingEmail, existingUsername] = await Promise.all([
		findUserByEmail(email),
		findUserByUsername(username)
	]);
	if (existingEmail || existingUsername) {
		throw new ServiceError('BAD_REQUEST', '注册信息已存在，请更换邮箱或用户名');
	}

	// 哈希密码
	const passwordHash = await hashPassword(password);

	// 创建用户
	const user = await createUser({
		username,
		displayName: displayName || username,
		email,
		passwordHash
	});

	return {
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.avatarUrl,
		role: user.role,
		email: user.email
	};
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
