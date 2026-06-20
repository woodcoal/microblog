/**
 * 帖子 Service
 *
 * 编排帖子点赞用户列表、置顶切换、密码验证的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */
import { findPostById, findPostByIdSelect, togglePostPinTransaction } from '@/lib/post';
import { findLikesByPostId } from '@/lib/social';
import { ServiceError } from '@/lib/errors';
import { verifyPassword } from '@/lib/auth';
import { MAX_USER_PINNED_POSTS } from '@/lib/config';

// ── 类型定义 ──

export interface GetPostLikersInput {
	postId: string;
}

export interface PostLiker {
	username: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface GetPostLikersResult {
	users: PostLiker[];
}

export interface TogglePinInput {
	userId: string;
	postId: string;
}

export interface TogglePinResult {
	pinned: boolean;
}

export interface VerifyPostPasswordInput {
	postId: string;
	password: string;
}

export interface VerifyPostPasswordResult {
	valid: boolean;
}

// ── 业务函数 ──

/**
 * 获取帖子点赞用户列表
 *
 * 查询指定帖子的点赞用户列表，按点赞时间倒序排列。
 *
 * @param input - { postId }
 * @returns 点赞用户列表
 */
export async function getPostLikers(input: GetPostLikersInput): Promise<GetPostLikersResult> {
	const { postId } = input;

	// 查询帖子是否存在
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}

	// 查询点赞用户列表，按时间倒序
	const likes = await findLikesByPostId(
		postId,
		{
			user: {
				select: {
					username: true,
					displayName: true,
					avatarUrl: true
				}
			}
		},
		{ createdAt: 'desc' }
	);

	const users = likes.map((l) => l.user);

	return { users };
}

/**
 * 切换帖子置顶状态
 *
 * 对帖子进行置顶/取消置顶切换操作。
 * 已置顶则取消，未置顶则置顶。
 * 仅帖子作者可操作。
 * 事务内检查置顶数量上限，保证原子性。
 *
 * @param input - { userId, postId }
 * @returns 当前置顶状态
 */
export async function togglePin(input: TogglePinInput): Promise<TogglePinResult> {
	const { userId, postId } = input;

	// 验证帖子存在且未删除
	const post = await findPostById(postId);
	if (!post) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}
	if (post.isDeleted) {
		throw new ServiceError('BAD_REQUEST', '帖子已删除');
	}

	// 验证是帖子作者
	if (post.userId !== userId) {
		throw new ServiceError('FORBIDDEN', '无权置顶此帖子');
	}

	// 检查置顶功能是否开启
	if (MAX_USER_PINNED_POSTS === 0) {
		throw new ServiceError('BAD_REQUEST', '置顶功能已关闭');
	}

	// 事务内检查置顶数量上限后切换状态
	const newPinned = await togglePostPinTransaction(
		userId,
		postId,
		post.isPinned,
		MAX_USER_PINNED_POSTS
	);

	return { pinned: newPinned };
}

/**
 * 验证密码保护帖子
 *
 * 验证用户输入的密码是否匹配密码保护帖子的密码。
 *
 * @param input - { postId, password }
 * @returns 密码是否正确
 */
export async function verifyPostPassword(
	input: VerifyPostPasswordInput
): Promise<VerifyPostPasswordResult> {
	const { postId, password } = input;

	// 查询帖子
	const post = await findPostByIdSelect(postId, {
		visibility: true,
		passwordHash: true,
		isDeleted: true
	});

	// 帖子不存在或已删除
	if (!post || post.isDeleted) {
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	}

	// 非密码保护帖子
	if (post.visibility !== 'password') {
		throw new ServiceError('BAD_REQUEST', '该帖子不需要密码验证');
	}

	// 没有密码哈希（数据异常）
	if (!post.passwordHash) {
		throw new ServiceError('BAD_REQUEST', '帖子密码配置异常');
	}

	// 验证密码
	const valid = await verifyPassword(password, post.passwordHash);

	return { valid };
}
