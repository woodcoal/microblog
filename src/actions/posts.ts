/**
 * 帖子相关 Actions
 *
 * 定义帖子点赞用户列表、置顶切换、密码验证等服务端 Actions。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import { prisma } from '@/lib/db';
import { getUserFromRequest, verifyPassword } from '@/lib/auth';
import { MAX_USER_PINNED_POSTS } from '@/lib/config';

/**
 * 获取帖子点赞用户列表 Action
 *
 * 查询指定帖子的点赞用户列表，按点赞时间倒序排列。
 * 不需要认证，任何人可查看。
 *
 * @param input - { postId: 帖子ID }
 * @returns { users: [{ username, displayName, avatarUrl }] } 点赞用户列表
 */
const getPostLikers = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input) => {
		const { postId } = input;

		// 查询帖子是否存在
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}

		// 查询点赞用户列表，按时间倒序
		const likes = await prisma.like.findMany({
			where: { postId },
			include: {
				user: {
					select: {
						username: true,
						displayName: true,
						avatarUrl: true
					}
				}
			},
			orderBy: { createdAt: 'desc' }
		});

		const users = likes.map((l) => l.user);

		return { users };
	}
});

/**
 * 切换帖子置顶状态 Action
 *
 * 对帖子进行置顶/取消置顶切换操作。
 * 已置顶则取消，未置顶则置顶。
 * 需要登录认证，仅帖子作者可操作。
 * 事务内检查置顶数量上限，保证原子性。
 *
 * @param input - { postId: 帖子ID }
 * @param context - Astro APIContext，用于提取认证信息
 * @returns { pinned: boolean } 当前置顶状态
 */
const togglePin = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空')
	}),
	handler: async (input, context) => {
		// 1. 验证登录状态
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) {
			throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		}

		const { postId } = input;

		// 2. 验证帖子存在且未删除
		const post = await prisma.post.findUnique({ where: { id: postId } });
		if (!post) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}
		if (post.isDeleted) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子已删除' });
		}

		// 3. 验证是帖子作者
		if (post.userId !== currentUser.userId) {
			throw new ActionError({ code: 'FORBIDDEN', message: '无权置顶此帖子' });
		}

		// 4. 检查置顶功能是否开启
		if (MAX_USER_PINNED_POSTS === 0) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '置顶功能已关闭' });
		}

		// 5. 事务内检查置顶数量上限后切换状态
		const newPinned = await prisma.$transaction(async (tx) => {
			// 如果要置顶（当前未置顶），检查用户已置顶数量是否达上限
			if (!post.isPinned) {
				const pinnedCount = await tx.post.count({
					where: {
						userId: currentUser.userId,
						isPinned: true,
						isDeleted: false
					}
				});
				if (pinnedCount >= MAX_USER_PINNED_POSTS) {
					throw new ActionError({
						code: 'BAD_REQUEST',
						message: '置顶数量已达上限'
					});
				}
			}

			// 切换置顶状态
			const pinned = !post.isPinned;
			await tx.post.update({
				where: { id: postId },
				data: { isPinned: pinned }
			});
			return pinned;
		});

		return { pinned: newPinned };
	}
});

/**
 * 验证密码保护帖子 Action
 *
 * 验证用户输入的密码是否匹配密码保护帖子的密码。
 * 不需要认证，任何人可尝试验证。
 *
 * @param input - { postId: 帖子ID, password: 用户输入的密码 }
 * @returns { valid: boolean } 密码是否正确
 */
const verifyPostPassword = defineAction({
	input: z.object({
		postId: z.string().min(1, '帖子 ID 不能为空'),
		password: z.string().min(1, '请输入密码')
	}),
	handler: async (input) => {
		const { postId, password } = input;

		// 查询帖子
		const post = await prisma.post.findUnique({
			where: { id: postId },
			select: {
				visibility: true,
				passwordHash: true,
				isDeleted: true
			}
		});

		// 帖子不存在或已删除
		if (!post || post.isDeleted) {
			throw new ActionError({ code: 'NOT_FOUND', message: '帖子不存在' });
		}

		// 非密码保护帖子
		if (post.visibility !== 'password') {
			throw new ActionError({ code: 'BAD_REQUEST', message: '该帖子不需要密码验证' });
		}

		// 没有密码哈希（数据异常）
		if (!post.passwordHash) {
			throw new ActionError({ code: 'BAD_REQUEST', message: '帖子密码配置异常' });
		}

		// 验证密码
		const valid = await verifyPassword(password, post.passwordHash);

		return { valid };
	}
});

export { getPostLikers, togglePin, verifyPostPassword };
