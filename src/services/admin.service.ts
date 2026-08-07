/**
 * 管理后台 Service
 *
 * 编排管理员对用户、帖子、评论的批量操作和标签管理业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import {
	batchDisableUsers,
	batchEnableUsers,
	createUser as createUserRecord,
	findUserByEmail,
	findUserByUsername
} from '@/lib/user';
import { hashPassword } from '@/lib/auth';
import {
	batchSoftDeletePosts,
	batchLockPosts,
	batchUnlockPosts,
	batchRestorePosts,
	batchSetGlobalPinPosts
} from '@/lib/post';
import { batchSoftDeleteComments } from '@/lib/comment';
import { findTagById, updateTagVisibility } from '@/lib/tag';
import { ServiceError } from '@/lib/errors';
import { PASSWORD_MIN_LENGTH, RESERVED_USERNAMES, USERNAME_PATTERN } from '@/lib/config';

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

/** 邮箱格式正则，与前台注册保持一致。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Prisma 唯一约束错误（P2002）的最小结构，避免泄露底层错误信息。 */
function isUniqueConstraintError(error: unknown): error is { code: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 'P2002'
	);
}

// ── 类型定义 ──

export interface BatchUsersInput {
	action: 'disable' | 'enable';
	ids: string[];
}

export interface BatchPostsInput {
	action: 'delete' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin';
	ids: string[];
	reason?: string;
	operatorId: string;
}

export interface BatchCommentsInput {
	ids: string[];
}

export interface ToggleTagVisibilityInput {
	tagId: string;
	action: 'hide' | 'show';
}

export interface CreateUserInput {
	username: string;
	displayName?: string;
	email: string;
	password: string;
	role?: 'user' | 'admin';
}

export interface CreateUserResult {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	role: string;
	email: string;
}

// ── 业务函数 ──

/**
 * 用户批量操作
 *
 * 管理员批量禁用或启用用户。
 * 禁用操作会跳过 admin 角色用户，防止误操作。
 *
 * @param input - { action, ids }
 * @returns 受影响的用户数量
 */
export async function batchUsers(input: BatchUsersInput): Promise<{ affected: number }> {
	const { action, ids } = input;

	// 验证 ids 数量上限
	if (ids.length > MAX_BATCH_SIZE) {
		throw new ServiceError('BAD_REQUEST', `单次最多操作 ${MAX_BATCH_SIZE} 条`);
	}

	let result: { count: number };

	if (action === 'disable') {
		// 禁用用户，排除 admin 角色防止误操作
		result = await batchDisableUsers(ids);
	} else {
		// 启用用户，无角色限制
		result = await batchEnableUsers(ids);
	}

	return { affected: result.count };
}

/**
 * 由管理员创建用户。
 *
 * 校验规则与前台注册一致，但不受 ALLOW_REGISTRATION 开关限制。
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
	const { username, displayName, email, password, role = 'user' } = input;

	if (!EMAIL_PATTERN.test(email)) {
		throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	}

	if (!USERNAME_PATTERN.test(username)) {
		throw new ServiceError('BAD_REQUEST', '用户名只能包含字母、数字和下划线，长度 3-20 个字符');
	}

	if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
		throw new ServiceError('BAD_REQUEST', '该用户名为系统保留，无法使用');
	}

	if (password.length < PASSWORD_MIN_LENGTH) {
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
	}

	const [existingEmail, existingUsername] = await Promise.all([
		findUserByEmail(email),
		findUserByUsername(username)
	]);
	if (existingEmail || existingUsername) {
		throw new ServiceError('BAD_REQUEST', '用户名或邮箱已被使用，请更换后重试');
	}

	const passwordHash = await hashPassword(password);
	let user;
	try {
		user = await createUserRecord({
			username,
			displayName: displayName || username,
			email,
			passwordHash,
			role
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new ServiceError('BAD_REQUEST', '用户名或邮箱已被使用，请更换后重试');
		}
		throw error;
	}

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
 * 帖子批量操作
 *
 * 管理员批量删除、还原、锁定、解锁或设置全局置顶状态。
 * 删除、还原和锁定操作需填写理由；还原会保存审计信息。
 *
 * @param input - { action, ids, reason?, operatorId }
 * @returns 受影响的帖子数量
 */
export async function batchPosts(input: BatchPostsInput): Promise<{ affected: number }> {
	const { action, ids, reason, operatorId } = input;

	// 验证 ids 数量上限
	if (ids.length > MAX_BATCH_SIZE) {
		throw new ServiceError('BAD_REQUEST', `单次最多操作 ${MAX_BATCH_SIZE} 条`);
	}

	let result: { count: number };

	if (action === 'delete') {
		// 删除操作需填写理由
		if (!reason || !reason.trim()) {
			throw new ServiceError('BAD_REQUEST', '删除理由不能为空');
		}
		// 软删除：设置 isDeleted、deleteReason、deletedBy
		result = await batchSoftDeletePosts(ids, reason.trim(), operatorId);
	} else if (action === 'restore') {
		if (!reason || !reason.trim()) {
			throw new ServiceError('BAD_REQUEST', '还原理由不能为空');
		}
		result = await batchRestorePosts(ids, reason.trim(), operatorId);
	} else if (action === 'lock') {
		// 锁定操作需填写理由
		if (!reason || !reason.trim()) {
			throw new ServiceError('BAD_REQUEST', '锁定理由不能为空');
		}
		// 锁定：设置 isLocked、lockedBy、lockReason
		result = await batchLockPosts(ids, reason.trim(), operatorId);
	} else if (action === 'unlock') {
		// 解锁：清除锁定状态
		result = await batchUnlockPosts(ids);
	} else {
		result = await batchSetGlobalPinPosts(ids, action === 'pin');
	}

	return { affected: result.count };
}

/**
 * 评论批量操作
 *
 * 管理员批量删除评论（软删除）。
 *
 * @param input - { ids }
 * @returns 受影响的评论数量
 */
export async function batchComments(input: BatchCommentsInput): Promise<{ affected: number }> {
	const { ids } = input;

	// 验证 ids 数量上限
	if (ids.length > MAX_BATCH_SIZE) {
		throw new ServiceError('BAD_REQUEST', `单次最多操作 ${MAX_BATCH_SIZE} 条`);
	}

	// 软删除评论：设置 isDeleted = true
	const result = await batchSoftDeleteComments(ids);

	return { affected: result.count };
}

/**
 * 标签显示/隐藏切换
 *
 * 管理员切换标签的隐藏状态。
 * 已隐藏则显示，未隐藏则隐藏。
 *
 * @param input - { tagId, action }
 * @returns 更新后的标签状态
 */
export async function toggleTagVisibility(
	input: ToggleTagVisibilityInput
): Promise<{ id: string; isHidden: boolean }> {
	const { tagId, action } = input;

	// 验证标签存在
	const tag = await findTagById(tagId);
	if (!tag) {
		throw new ServiceError('NOT_FOUND', '标签不存在');
	}

	// 防止重复操作
	if (action === 'hide' && tag.isHidden) {
		throw new ServiceError('BAD_REQUEST', '标签已被隐藏');
	}
	if (action === 'show' && !tag.isHidden) {
		throw new ServiceError('BAD_REQUEST', '标签未被隐藏');
	}

	// 更新标签状态
	await updateTagVisibility(tagId, action === 'hide');

	return { id: tagId, isHidden: action === 'hide' };
}
