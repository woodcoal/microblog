/**
 * 认证工具函数
 *
 * 提供密码哈希/验证、JWT 生成/验证、请求用户提取等功能。
 * 使用 bcryptjs（Cloudflare Workers 兼容）和 jose（Web Crypto API）。
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { JWT_SECRET, JWT_EXPIRES_DAYS } from './config';
import type { APIContext } from 'astro';

/** Context fields used by authentication helpers in API routes, pages, and Actions. */
type AuthContext = Pick<APIContext, 'request' | 'cookies'>;

/** JWT payload 结构 */
export interface JwtPayload {
	userId: string;
	username: string;
	role: string;
}

/** 将密钥转为 Uint8Array，供 jose 使用 */
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * 对密码进行 bcrypt 哈希
 *
 * @param password - 明文密码
 * @returns bcrypt 哈希字符串
 */
export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 10);
}

/**
 * 验证明文密码与哈希是否匹配
 *
 * @param password - 明文密码
 * @param hash - bcrypt 哈希
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

/**
 * 生成 JWT Token
 *
 * @param payload - 包含 userId、username、role 的载荷
 * @returns 签名后的 JWT 字符串
 */
export async function generateToken(payload: JwtPayload): Promise<string> {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${JWT_EXPIRES_DAYS}d`)
		.sign(secretKey);
}

/**
 * 验证 JWT Token 并返回载荷
 *
 * @param token - JWT 字符串
 * @returns 验证成功返回载荷，失败返回 null
 */
async function verifyToken(token: string): Promise<JwtPayload | null> {
	try {
		const { payload } = await jwtVerify(token, secretKey);
		return {
			userId: payload.userId as string,
			username: payload.username as string,
			role: payload.role as string
		};
	} catch {
		return null;
	}
}

/**
 * 检查用户是否被禁用或尚未完成邮箱验证
 *
 * 通过动态导入 prisma 查询用户 isDisabled 状态，
 * 避免在模块顶层导入导致循环依赖。
 *
 * @param userId - 用户 ID
 * @returns 用户已被禁用返回 true，否则返回 false
 */
async function isUserUnavailable(userId: string): Promise<boolean> {
	try {
		const { prisma } = await import('./db');
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { isDisabled: true, emailVerifiedAt: true }
		});
		// 用户不存在时视为禁用（JWT 中的 userId 对应的用户已被删除）
		return user?.isDisabled || !user?.emailVerifiedAt;
	} catch {
		// 查询失败时采用 fail-closed 策略，拒绝访问
		console.error('检查用户状态失败，默认拒绝访问');
		return true;
	}
}

/**
 * 从请求中提取并验证当前用户
 *
 * 支持三种认证方式（按优先级）：
 * 1. Authorization: Bearer mt_xxx → API Token 认证
 * 2. Authorization: Bearer xxx → JWT Token 认证
 * 3. cookie 中的 token → JWT Token 认证（SSR 页面使用）
 *
 * API Token 认证成功时会更新 lastUsedAt。
 * JWT Token 认证成功后会额外检查用户 isDisabled 状态，禁用用户返回 null。
 *
 * @param context - Astro APIContext
 * @returns 用户信息，未认证或用户已禁用返回 null
 */
/**
 * 验证请求并要求登录
 *
 * 调用 getUserFromRequest 获取当前用户，未登录时返回 401 Response。
 * 用于 API 路由中统一处理认证检查。
 *
 * @param context - Astro APIContext
 * @returns 用户信息，未登录时返回 Response 对象
 */
export async function requireAuth(context: AuthContext): Promise<JwtPayload | Response> {
	const user = await getUserFromRequest(context);
	if (!user) {
		return new Response(
			JSON.stringify({ success: false, error: { message: '请先登录', status: 401 } }),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
	return user;
}

/**
 * 仅从 Authorization: Bearer 头验证身份。
 *
 * 外部 API 使用 Bearer-only 威胁模型；不得在该场景回退到浏览器 cookie，
 * 否则会重新引入浏览器自动携带 cookie 所造成的 CSRF 攻击面。
 */
export async function getUserFromBearerRequest(request: Request): Promise<JwtPayload | null> {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) return null;

	const token = authHeader.slice(7).trim();
	if (!token) return null;

	if (token.startsWith('mt_')) return verifyApiTokenFromRequest(token);

	const payload = await verifyToken(token);
	if (payload && (await isUserUnavailable(payload.userId))) return null;
	return payload;
}

export async function getUserFromRequest(context: AuthContext): Promise<JwtPayload | null> {
	// 1. 尝试从 Authorization header 读取
	if (context.request.headers.get('authorization')?.startsWith('Bearer ')) {
		return getUserFromBearerRequest(context.request);
	}

	// 2. 尝试从 cookie 读取
	const cookieToken = context.cookies.get('token')?.value;
	if (cookieToken) {
		const payload = await verifyToken(cookieToken);
		if (payload && (await isUserUnavailable(payload.userId))) {
			return null;
		}
		return payload;
	}

	return null;
}

/**
 * 通过 API Token 验证用户身份
 *
 * 计算 Token 的 SHA-256 哈希，在数据库中查找匹配记录，
 * 验证成功后更新 lastUsedAt 并返回用户信息。
 *
 * @param token - API Token 明文（mt_ 前缀格式）
 * @returns 用户信息，验证失败返回 null
 */
async function verifyApiTokenFromRequest(token: string): Promise<JwtPayload | null> {
	try {
		// 动态导入避免循环依赖
		const { hashToken } = await import('./token');
		const { prisma } = await import('./db');

		const tokenHash = await hashToken(token);

		// 查找匹配的 ApiToken 记录
		const apiToken = await prisma.apiToken.findUnique({
			where: { tokenHash },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						role: true,
						isDisabled: true,
						emailVerifiedAt: true
					}
				}
			}
		});

		if (!apiToken || apiToken.user.isDisabled || !apiToken.user.emailVerifiedAt) {
			return null;
		}

		// 更新最后使用时间（异步执行，不阻塞主流程）
		prisma.apiToken
			.update({
				where: { id: apiToken.id },
				data: { lastUsedAt: new Date() }
			})
			.catch(() => {});

		return {
			userId: apiToken.user.id,
			username: apiToken.user.username,
			role: apiToken.user.role
		};
	} catch {
		return null;
	}
}

/**
 * 将 token 写入 cookie
 *
 * @param context - Astro APIContext
 * @param token - JWT 字符串
 */
export function setTokenCookie(context: AuthContext, token: string): void {
	// 判断是否为 HTTPS 环境，动态设置 secure 属性
	const url = new URL(context.request.url);
	const isSecure = url.protocol === 'https:';

	context.cookies.set('token', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: JWT_EXPIRES_DAYS * 24 * 60 * 60
	});
}

/**
 * 清除 token cookie
 *
 * @param context - Astro APIContext
 */
export function clearTokenCookie(context: AuthContext): void {
	const url = new URL(context.request.url);
	const isSecure = url.protocol === 'https:';

	context.cookies.set('token', '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 0
	});
}
