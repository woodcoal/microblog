/** 管理后台 Service：管理员处置、不可变审计、审计查询和既有管理能力。 */
import { createUser as createUserRecord, findUserByEmail, findUserByUsername } from '@/lib/user';
import { hashPassword } from '@/lib/auth';
import { findTagById, updateTagVisibility } from '@/lib/tag';
import { ServiceError } from '@/lib/errors';
import { PASSWORD_MIN_LENGTH, RESERVED_USERNAMES, USERNAME_PATTERN } from '@/lib/config';
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';
import type { AdminAuditLogDto } from '@/types/dto';

const MAX_BATCH_SIZE = 100;
const MIN_REASON_LENGTH = 2;
const MAX_REASON_LENGTH = 500;
const DEFAULT_AUDIT_RANGE_DAYS = 90;
const MAX_AUDIT_QUERY_LIMIT = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_AUDIT_ACTIONS = [
	'user.disable',
	'user.enable',
	'post.delete',
	'post.restore',
	'post.lock',
	'post.unlock',
	'post.pin',
	'post.unpin',
	'comment.delete'
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];
export type AdminAuditTargetType = 'user' | 'post' | 'comment';
type PostAuditAction = Extract<AdminAuditAction, `post.${string}`>;
type PostStateField = 'isDeleted' | 'isLocked' | 'isGlobalPinned';

const POST_ACTION_TARGET_STATES: Record<
	PostAuditAction,
	{ field: PostStateField; desired: boolean }
> = {
	'post.delete': { field: 'isDeleted', desired: true },
	'post.restore': { field: 'isDeleted', desired: false },
	'post.lock': { field: 'isLocked', desired: true },
	'post.unlock': { field: 'isLocked', desired: false },
	'post.pin': { field: 'isGlobalPinned', desired: true },
	'post.unpin': { field: 'isGlobalPinned', desired: false }
};

function isUniqueConstraintError(error: unknown): error is { code: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 'P2002'
	);
}

export interface BatchUsersInput {
	action: 'disable' | 'enable';
	ids: string[];
	reason: string;
	requestId: string;
	operatorId: string;
}
export interface BatchPostsInput {
	action: 'delete' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin';
	ids: string[];
	reason: string;
	requestId: string;
	operatorId: string;
}
export interface BatchCommentsInput {
	ids: string[];
	reason: string;
	requestId: string;
	operatorId: string;
}
export interface QueryAdminAuditLogsInput {
	operatorId: string;
	targetType?: AdminAuditTargetType;
	action?: AdminAuditAction;
	auditOperatorId?: string;
	result?: 'success';
	from?: string;
	to?: string;
	targetId?: string;
	cursor?: { createdAt: string; id: string };
	limit?: number;
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

type AuditedMutationInput = {
	action: AdminAuditAction;
	ids: string[];
	reason: string;
	requestId: string;
	operatorId: string;
};

function normalizeMutationInput(input: AuditedMutationInput) {
	if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== 'string')) {
		throw new ServiceError('BAD_REQUEST', 'ids 必须包含 1 到 100 个有效 ID');
	}
	const ids = [...new Set(input.ids.map((id) => id.trim()))];
	if (ids.length < 1 || ids.some((id) => !id))
		throw new ServiceError('BAD_REQUEST', 'ids 必须包含 1 到 100 个有效 ID');
	if (ids.length > MAX_BATCH_SIZE)
		throw new ServiceError('BAD_REQUEST', `单次最多操作 ${MAX_BATCH_SIZE} 条`);
	const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
	if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
		throw new ServiceError(
			'BAD_REQUEST',
			`理由长度必须为 ${MIN_REASON_LENGTH} 到 ${MAX_REASON_LENGTH} 个字符`
		);
	}
	const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
	if (!UUID_PATTERN.test(requestId))
		throw new ServiceError('BAD_REQUEST', 'requestId 必须是有效 UUID');
	if (!ADMIN_AUDIT_ACTIONS.includes(input.action))
		throw new ServiceError('BAD_REQUEST', '不支持的管理员处置动作');
	return { ...input, ids, reason, requestId };
}

async function assertAdmin(tx: Prisma.TransactionClient, operatorId: string) {
	const operator = await tx.user.findUnique({
		where: { id: operatorId },
		select: { role: true }
	});
	if (!operator || operator.role !== 'admin')
		throw new ServiceError('FORBIDDEN', '仅管理员可操作');
}

function actionTargetType(action: AdminAuditAction): AdminAuditTargetType {
	return action.slice(0, action.indexOf('.')) as AdminAuditTargetType;
}

async function mutateTargets(
	tx: Prisma.TransactionClient,
	input: ReturnType<typeof normalizeMutationInput>
) {
	const { action, ids, reason, operatorId } = input;
	let existing: Array<Record<string, unknown>>;
	let candidateIds: string[];
	let result: { count: number };

	if (action.startsWith('user.')) {
		existing = await tx.user.findMany({
			where: { id: { in: ids } },
			select: { id: true, role: true, isDisabled: true }
		});
		if (
			existing.length !== ids.length ||
			(action === 'user.disable' && existing.some((item) => item.role === 'admin'))
		) {
			throw new ServiceError('BAD_REQUEST', '用户目标不存在或不允许处置');
		}
		const desired = action === 'user.disable';
		candidateIds = existing
			.filter((item) => item.isDisabled !== desired)
			.map((item) => item.id as string);
		result = await tx.user.updateMany({
			where: { id: { in: candidateIds }, isDisabled: !desired },
			data: { isDisabled: desired }
		});
	} else if (action.startsWith('post.')) {
		existing = await tx.post.findMany({
			where: { id: { in: ids } },
			select: { id: true, isDeleted: true, isLocked: true, isGlobalPinned: true }
		});
		if (
			existing.length !== ids.length ||
			(action === 'post.pin' && existing.some((item) => item.isDeleted))
		) {
			throw new ServiceError('BAD_REQUEST', '帖子目标不存在或不允许处置');
		}
		const { field, desired } = POST_ACTION_TARGET_STATES[action as PostAuditAction];
		candidateIds = existing
			.filter((item) => item[field] !== desired)
			.map((item) => item.id as string);
		const data: Prisma.PostUpdateManyMutationInput =
			action === 'post.delete'
				? { isDeleted: true, deleteReason: reason, deletedBy: operatorId }
				: action === 'post.restore'
					? {
							isDeleted: false,
							deleteReason: null,
							deletedBy: null,
							restoreReason: reason,
							restoredBy: operatorId
						}
					: action === 'post.lock'
						? { isLocked: true, lockReason: reason, lockedBy: operatorId }
						: action === 'post.unlock'
							? { isLocked: false, lockReason: null, lockedBy: null }
							: { isGlobalPinned: action === 'post.pin' };
		result = await tx.post.updateMany({
			where: { id: { in: candidateIds }, [field]: !desired },
			data
		});
	} else {
		existing = await tx.comment.findMany({
			where: { id: { in: ids } },
			select: { id: true, isDeleted: true }
		});
		if (existing.length !== ids.length) throw new ServiceError('BAD_REQUEST', '评论目标不存在');
		candidateIds = existing.filter((item) => !item.isDeleted).map((item) => item.id as string);
		result = await tx.comment.updateMany({
			where: { id: { in: candidateIds }, isDeleted: false },
			data: { isDeleted: true }
		});
	}

	if (result.count !== candidateIds.length)
		throw new ServiceError('BAD_REQUEST', '目标状态已并发变化，请刷新后重试');
	return new Set(candidateIds);
}

/** 状态写入、审计主记录和全部目标明细在同一 Prisma 事务中提交。 */
export async function executeAuditedAdminMutation(
	input: AuditedMutationInput
): Promise<{ affected: number }> {
	const normalized = normalizeMutationInput(input);
	try {
		return await prisma.$transaction(async (tx) => {
			await assertAdmin(tx, normalized.operatorId);
			const replay = await tx.adminAuditLog.findUnique({
				where: {
					operatorId_requestId: {
						operatorId: normalized.operatorId,
						requestId: normalized.requestId
					}
				},
				select: { affectedCount: true }
			});
			if (replay) return { affected: replay.affectedCount };
			const updatedIds = await mutateTargets(tx, normalized);
			await tx.adminAuditLog.create({
				data: {
					operatorId: normalized.operatorId,
					requestId: normalized.requestId,
					targetType: actionTargetType(normalized.action),
					action: normalized.action,
					reason: normalized.reason,
					requestedCount: normalized.ids.length,
					affectedCount: updatedIds.size,
					targets: {
						create: normalized.ids.map((targetId) => ({
							targetId,
							outcome: updatedIds.has(targetId) ? 'updated' : 'unchanged'
						}))
					}
				}
			});
			return { affected: updatedIds.size };
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			const replay = await prisma.adminAuditLog.findUnique({
				where: {
					operatorId_requestId: {
						operatorId: normalized.operatorId,
						requestId: normalized.requestId
					}
				},
				select: { affectedCount: true }
			});
			if (replay) return { affected: replay.affectedCount };
		}
		throw error;
	}
}

export async function batchUsers(input: BatchUsersInput) {
	return executeAuditedAdminMutation({ ...input, action: `user.${input.action}` });
}
export async function batchPosts(input: BatchPostsInput) {
	return executeAuditedAdminMutation({ ...input, action: `post.${input.action}` });
}
export async function batchComments(input: BatchCommentsInput) {
	return executeAuditedAdminMutation({ ...input, action: 'comment.delete' });
}

/** 仅管理员可用的最小字段审计查询，使用 (createdAt, id) 复合游标。 */
export async function queryAdminAuditLogs(input: QueryAdminAuditLogsInput): Promise<{
	items: AdminAuditLogDto[];
	nextCursor: { createdAt: string; id: string } | null;
}> {
	if (
		!input.operatorId ||
		(input.targetType && !['user', 'post', 'comment'].includes(input.targetType))
	) {
		throw new ServiceError('BAD_REQUEST', '审计查询参数无效');
	}
	if (input.action && !ADMIN_AUDIT_ACTIONS.includes(input.action)) {
		throw new ServiceError('BAD_REQUEST', '审计动作无效');
	}
	if (input.result && input.result !== 'success') {
		throw new ServiceError('BAD_REQUEST', '审计结果筛选无效');
	}
	const limit = input.limit ?? 20;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_AUDIT_QUERY_LIMIT)
		throw new ServiceError('BAD_REQUEST', `limit 必须为 1 到 ${MAX_AUDIT_QUERY_LIMIT} 的整数`);
	const to = input.to ? new Date(input.to) : new Date();
	const from = input.from
		? new Date(input.from)
		: new Date(to.getTime() - DEFAULT_AUDIT_RANGE_DAYS * 86_400_000);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
		throw new ServiceError('BAD_REQUEST', '审计时间范围无效');
	if (!input.targetId && to.getTime() - from.getTime() > DEFAULT_AUDIT_RANGE_DAYS * 86_400_000) {
		throw new ServiceError(
			'BAD_REQUEST',
			`审计查询跨度不能超过 ${DEFAULT_AUDIT_RANGE_DAYS} 天`
		);
	}
	let cursor: { createdAt: Date; id: string } | undefined;
	if (input.cursor) {
		const createdAt = new Date(input.cursor.createdAt);
		if (Number.isNaN(createdAt.getTime()) || !input.cursor.id.trim())
			throw new ServiceError('BAD_REQUEST', '游标无效');
		cursor = { createdAt, id: input.cursor.id };
	}
	const records = await prisma.$transaction(async (tx) => {
		await assertAdmin(tx, input.operatorId);
		return tx.adminAuditLog.findMany({
			where: {
				targetType: input.targetType,
				action: input.action,
				operatorId: input.auditOperatorId,
				result: input.result,
				createdAt: { gte: from, lte: to },
				targets: input.targetId ? { some: { targetId: input.targetId } } : undefined,
				OR: cursor
					? [
							{ createdAt: { lt: cursor.createdAt } },
							{ createdAt: cursor.createdAt, id: { lt: cursor.id } }
						]
					: undefined
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: limit + 1,
			select: {
				id: true,
				action: true,
				targetType: true,
				reason: true,
				result: true,
				requestedCount: true,
				affectedCount: true,
				createdAt: true,
				operator: {
					select: { id: true, username: true, displayName: true, avatarUrl: true }
				},
				targets: { select: { targetId: true, outcome: true }, orderBy: { targetId: 'asc' } }
			}
		});
	});
	const hasMore = records.length > limit;
	const items: AdminAuditLogDto[] = records.slice(0, limit).map((record) => ({
		...record,
		action: record.action as AdminAuditAction,
		targetType: record.targetType as AdminAuditTargetType,
		result: 'success',
		createdAt: record.createdAt.toISOString(),
		targets: record.targets.map((target) => ({
			...target,
			outcome: target.outcome === 'unchanged' ? 'unchanged' : 'updated'
		}))
	}));
	const last = items.at(-1);
	return {
		items,
		nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null
	};
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
	const { username, displayName, email, password, role = 'user' } = input;
	if (!EMAIL_PATTERN.test(email)) throw new ServiceError('BAD_REQUEST', '邮箱格式无效');
	if (!USERNAME_PATTERN.test(username))
		throw new ServiceError('BAD_REQUEST', '用户名只能包含字母、数字和下划线，长度 3-20 个字符');
	if (RESERVED_USERNAMES.includes(username.toLowerCase()))
		throw new ServiceError('BAD_REQUEST', '该用户名为系统保留，无法使用');
	if (password.length < PASSWORD_MIN_LENGTH)
		throw new ServiceError('BAD_REQUEST', `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
	const [existingEmail, existingUsername] = await Promise.all([
		findUserByEmail(email),
		findUserByUsername(username)
	]);
	if (existingEmail || existingUsername)
		throw new ServiceError('BAD_REQUEST', '用户名或邮箱已被使用，请更换后重试');
	const passwordHash = await hashPassword(password);
	try {
		const user = await createUserRecord({
			username,
			displayName: displayName || username,
			email,
			passwordHash,
			role
		});
		return {
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl,
			role: user.role,
			email: user.email
		};
	} catch (error) {
		if (isUniqueConstraintError(error))
			throw new ServiceError('BAD_REQUEST', '用户名或邮箱已被使用，请更换后重试');
		throw error;
	}
}

export async function toggleTagVisibility(
	input: ToggleTagVisibilityInput
): Promise<{ id: string; isHidden: boolean }> {
	const tag = await findTagById(input.tagId);
	if (!tag) throw new ServiceError('NOT_FOUND', '标签不存在');
	if (input.action === 'hide' && tag.isHidden)
		throw new ServiceError('BAD_REQUEST', '标签已被隐藏');
	if (input.action === 'show' && !tag.isHidden)
		throw new ServiceError('BAD_REQUEST', '标签未被隐藏');
	await updateTagVisibility(input.tagId, input.action === 'hide');
	return { id: input.tagId, isHidden: input.action === 'hide' };
}
