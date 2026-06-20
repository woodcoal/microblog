/**
 * 用户数据库操作模块
 *
 * 提供用户的 CRUD 原子操作，供 Service 层调用。
 * 所有函数直接操作 Prisma Client，不包含业务逻辑校验。
 */
import { prisma } from '@/lib/db';
import type { Prisma } from '../../generated/prisma/client';

/**
 * 按 ID 查询用户
 *
 * @param id - 用户 ID
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserById<T extends Prisma.UserSelect>(id: string, select?: T) {
	return prisma.user.findUnique({
		where: { id },
		...(select ? { select } : {})
	});
}

/**
 * 按邮箱查询用户
 *
 * @param email - 用户邮箱
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserByEmail(email: string) {
	return prisma.user.findUnique({ where: { email } });
}

/**
 * 按用户名查询用户
 *
 * @param username - 用户名
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 用户记录，不存在则返回 null
 */
export async function findUserByUsername<T extends Prisma.UserSelect>(
	username: string,
	select?: T
) {
	return prisma.user.findUnique({
		where: { username },
		...(select ? { select } : {})
	});
}

/**
 * 创建用户
 *
 * @param data - 用户创建数据（Prisma UserCreateInput）
 * @returns 新创建的用户记录
 */
export async function createUser(data: Prisma.UserCreateInput) {
	return prisma.user.create({ data });
}

/**
 * 更新用户
 *
 * @param id - 用户 ID
 * @param data - 更新数据（Prisma UserUpdateInput）
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 更新后的用户记录
 */
export async function updateUser<T extends Prisma.UserSelect>(
	id: string,
	data: Prisma.UserUpdateInput,
	select?: T
) {
	return prisma.user.update({
		where: { id },
		data,
		...(select ? { select } : {})
	});
}

/**
 * 批量禁用用户
 *
 * 排除 admin 角色用户，防止误操作。
 *
 * @param ids - 用户 ID 数组
 * @returns 受影响的用户数量
 */
export async function batchDisableUsers(ids: string[]) {
	return prisma.user.updateMany({
		where: {
			id: { in: ids },
			role: { not: 'admin' }
		},
		data: { isDisabled: true }
	});
}

/**
 * 批量启用用户
 *
 * @param ids - 用户 ID 数组
 * @returns 受影响的用户数量
 */
export async function batchEnableUsers(ids: string[]) {
	return prisma.user.updateMany({
		where: { id: { in: ids } },
		data: { isDisabled: false }
	});
}

/**
 * 按用户名列表搜索用户
 *
 * 精确匹配用户名，排除被禁用的用户。
 *
 * @param usernames - 用户名数组
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的用户列表
 */
export async function searchUsersByUsernames<T extends Prisma.UserSelect>(
	usernames: string[],
	select?: T
) {
	return prisma.user.findMany({
		where: {
			username: { in: usernames },
			isDisabled: false
		},
		...(select ? { select } : {})
	});
}

/**
 * 搜索用户（模糊匹配）
 *
 * 按用户名和显示名模糊匹配，排除被禁用的用户。
 *
 * @param query - 搜索关键词
 * @param take - 返回数量上限
 * @param select - 可选，指定返回字段（Prisma select 对象）
 * @returns 匹配的用户列表
 */
export async function searchUsers<T extends Prisma.UserSelect>(
	query: string,
	take: number,
	select?: T
) {
	return prisma.user.findMany({
		where: {
			isDisabled: false,
			OR: [{ username: { contains: query } }, { displayName: { contains: query } }]
		},
		orderBy: { followers: { _count: 'desc' } },
		take,
		...(select ? { select } : {})
	});
}
