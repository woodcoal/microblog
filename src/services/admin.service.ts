/**
 * 管理后台 Service
 *
 * 编排管理员对用户、帖子、评论的批量操作和标签管理业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { batchDisableUsers, batchEnableUsers } from '@/lib/user';
import { batchSoftDeletePosts, batchLockPosts, batchUnlockPosts } from '@/lib/post';
import { batchSoftDeleteComments } from '@/lib/comment';
import { findTagById, updateTagVisibility } from '@/lib/tag';
import { ServiceError } from '@/lib/errors';

/** 单次批量操作最大数量 */
const MAX_BATCH_SIZE = 100;

// ── 类型定义 ──

export interface BatchUsersInput {
	action: 'disable' | 'enable';
	ids: string[];
}

export interface BatchPostsInput {
	action: 'delete' | 'lock' | 'unlock';
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
 * 帖子批量操作
 *
 * 管理员批量删除、锁定或解锁帖子。
 * 删除和锁定操作需填写理由。
 * 删除为软删除，锁定设置锁定信息，解锁清除锁定状态。
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
	} else if (action === 'lock') {
		// 锁定操作需填写理由
		if (!reason || !reason.trim()) {
			throw new ServiceError('BAD_REQUEST', '锁定理由不能为空');
		}
		// 锁定：设置 isLocked、lockedBy、lockReason
		result = await batchLockPosts(ids, reason.trim(), operatorId);
	} else {
		// 解锁：清除锁定状态
		result = await batchUnlockPosts(ids);
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
