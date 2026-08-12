/** 用户名生命周期：永久占用、一次自助改名和管理员审计改名。 */
import { prisma } from '@/lib/db';
import { assertValidUsername } from '@/lib/username';
import { ServiceError } from '@/lib/errors';

export type RenameUsernameInput = {
	userId: string;
	actorId: string;
	username: string;
	isAdmin?: boolean;
};

export async function renameUsername(input: RenameUsernameInput): Promise<{ username: string }> {
	const nextUsername = assertValidUsername(input.username);
	try {
		return await prisma.$transaction(async (tx) => {
			const [user, actor] = await Promise.all([
				tx.user.findUnique({
					where: { id: input.userId },
					select: { id: true, username: true, hasSelfRenamed: true }
				}),
				tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } })
			]);
			if (!user) throw new ServiceError('NOT_FOUND', '用户不存在');
			const isAdmin = input.isAdmin === true;
			if (isAdmin && actor?.role !== 'admin')
				throw new ServiceError('FORBIDDEN', '仅管理员可操作');
			if (!isAdmin && input.userId !== input.actorId)
				throw new ServiceError('FORBIDDEN', '不能修改其他用户的用户名');
			if (user.username === nextUsername)
				throw new ServiceError('BAD_REQUEST', '新用户名与当前用户名相同');
			if (!isAdmin && user.hasSelfRenamed)
				throw new ServiceError('FORBIDDEN', '用户名仅可自助修改一次');

			await tx.usernameClaim.create({ data: { username: nextUsername, userId: user.id } });
			if (isAdmin) {
				await tx.user.update({ where: { id: user.id }, data: { username: nextUsername } });
			} else {
				// 条件更新是并发下的额度裁决点：两个请求都读到 false 时也仅一个能成功。
				const changed = await tx.user.updateMany({
					where: { id: user.id, hasSelfRenamed: false },
					data: { username: nextUsername, hasSelfRenamed: true }
				});
				if (changed.count !== 1)
					throw new ServiceError('FORBIDDEN', '用户名仅可自助修改一次');
			}
			await tx.usernameRenameAudit.create({
				data: {
					userId: user.id,
					actorId: input.actorId,
					previousUsername: user.username,
					nextUsername,
					isAdmin
				}
			});
			return { username: nextUsername };
		});
	} catch (error) {
		if (isUniqueConstraintError(error))
			throw new ServiceError('BAD_REQUEST', '该用户名已被使用，无法分配');
		throw error;
	}
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
