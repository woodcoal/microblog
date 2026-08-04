/** /api/v1 查询与 DTO 适配；不依赖 Astro transport。 */
import { renderMarkdown } from '@/lib/markdown';
import { ServiceError } from '@/lib/errors';
import { countPosts, findApiPost, findApiPosts } from '@/lib/post';
import { countApiComments, findApiComments } from '@/lib/comment';
import { countApiUsers, findApiUser, findApiUsers } from '@/lib/user';
import { findFollowingIds } from '@/lib/social';
import { findTagByName } from '@/lib/tag';
import type { Prisma } from '../../generated/prisma/client';
import type { CommentDto, PageDto, PostDto, UserDto } from '@/types/dto';

type ApiPost = NonNullable<Awaited<ReturnType<typeof findApiPost>>>;
type ApiComment = Awaited<ReturnType<typeof findApiComments>>[number];
type ApiUser = NonNullable<Awaited<ReturnType<typeof findApiUser>>>;

export interface PageInput {
	page: number;
	pageSize: number;
	viewerId?: string;
}

function toUserDto(user: ApiUser): UserDto {
	return {
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.avatarUrl || null,
		bio: user.bio || null,
		postCount: user._count.posts,
		followerCount: user._count.followers,
		followingCount: user._count.following,
		following: user.followers.length > 0,
		createdAt: user.createdAt.toISOString()
	};
}

function toPostDto(post: ApiPost): PostDto {
	const mode = post.mode === 'forum' || post.mode === 'blog' ? post.mode : 'weibo';
	return {
		id: post.id,
		title: post.title,
		content: post.content,
		contentHtml: renderMarkdown(post.content),
		mode,
		visibility: post.visibility,
		author: toUserDto(post.user),
		likeCount: post._count.likes,
		commentCount: post._count.comments,
		liked: post.likes.length > 0,
		isPinned: post.isPinned,
		isLocked: post.isLocked,
		isEdited: post.isEdited,
		isPasswordProtected: post.visibility === 'password',
		media: post.media.map((media) => ({
			id: media.id,
			url: media.fileStorage.filePath,
			mimeType: media.fileStorage.mimeType,
			type: media.fileStorage.fileType === 'attachment' ? 'attachment' : 'image'
		})),
		tags: post.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
		createdAt: post.createdAt.toISOString(),
		updatedAt: post.updatedAt.toISOString()
	};
}

function toCommentDto(comment: ApiComment): CommentDto {
	return {
		id: comment.id,
		postId: comment.postId,
		parentId: comment.parentId,
		content: comment.content,
		author: toUserDto(comment.user),
		likeCount: comment._count.likes,
		liked: comment.likes.length > 0,
		createdAt: comment.createdAt.toISOString(),
		updatedAt: comment.updatedAt.toISOString()
	};
}

async function getPostPage(
	where: Prisma.PostWhereInput,
	input: PageInput,
	sort: 'latest' | 'hot' = 'latest'
): Promise<PageDto<PostDto>> {
	const skip = (input.page - 1) * input.pageSize;
	const [posts, total] = await Promise.all([
		findApiPosts(where, {
			skip,
			take: input.pageSize,
			orderBy: sort === 'hot' ? { createdAt: 'desc' } : { createdAt: 'desc' },
			viewerId: input.viewerId
		}),
		countPosts(where)
	]);
	return { items: posts.map(toPostDto), total, page: input.page, pageSize: input.pageSize };
}

const publicPostWhere = (): Prisma.PostWhereInput => ({ isDeleted: false, visibility: 'public' });

export function getPublicPosts(input: PageInput & { sort?: 'latest' | 'hot' }) {
	return getPostPage(publicPostWhere(), input, input.sort);
}

export async function getPublicPost(postId: string, viewerId?: string): Promise<PostDto> {
	const post = await findApiPost(postId, viewerId);
	if (!post || post.isDeleted || post.visibility !== 'public')
		throw new ServiceError('NOT_FOUND', '帖子不存在');
	return toPostDto(post);
}

/** 用于已完成作者权限校验后的写操作响应。 */
export async function getPostForApi(postId: string, viewerId?: string): Promise<PostDto> {
	const post = await findApiPost(postId, viewerId);
	if (!post || post.isDeleted) throw new ServiceError('NOT_FOUND', '帖子不存在');
	return toPostDto(post);
}

export async function getPostComments(
	postId: string,
	input: PageInput
): Promise<PageDto<CommentDto>> {
	await getPublicPost(postId, input.viewerId);
	const skip = (input.page - 1) * input.pageSize;
	const [comments, total] = await Promise.all([
		findApiComments(postId, skip, input.pageSize, input.viewerId),
		countApiComments(postId)
	]);
	return { items: comments.map(toCommentDto), total, page: input.page, pageSize: input.pageSize };
}

export async function getUser(username: string, viewerId?: string): Promise<UserDto> {
	const user = await findApiUser(username, viewerId);
	if (!user) throw new ServiceError('NOT_FOUND', '用户不存在');
	return toUserDto(user);
}

export async function getUserPosts(username: string, input: PageInput) {
	const user = await findApiUser(username, input.viewerId);
	if (!user) throw new ServiceError('NOT_FOUND', '用户不存在');
	return getPostPage({ ...publicPostWhere(), userId: user.id }, input);
}

export async function getFollowingTimeline(userId: string, input: Omit<PageInput, 'viewerId'>) {
	const followingIds = await findFollowingIds(userId);
	return getPostPage(
		{ ...publicPostWhere(), userId: { in: [userId, ...followingIds] } },
		{ ...input, viewerId: userId }
	);
}

export function searchPublicPosts(query: string, input: PageInput) {
	if (!query.trim()) throw new ServiceError('BAD_REQUEST', 'q 不能为空');
	return getPostPage(
		{
			...publicPostWhere(),
			OR: [{ content: { contains: query } }, { title: { contains: query } }]
		},
		input
	);
}

export async function searchPublicUsers(
	query: string,
	input: PageInput
): Promise<PageDto<UserDto>> {
	if (!query.trim()) throw new ServiceError('BAD_REQUEST', 'q 不能为空');
	const skip = (input.page - 1) * input.pageSize;
	const [users, total] = await Promise.all([
		findApiUsers(query, skip, input.pageSize, input.viewerId),
		countApiUsers(query)
	]);
	return { items: users.map(toUserDto), total, page: input.page, pageSize: input.pageSize };
}

export async function getTagPosts(name: string, input: PageInput) {
	const tag = await findTagByName(name);
	if (!tag || tag.isHidden) throw new ServiceError('NOT_FOUND', '标签不存在');
	return getPostPage({ ...publicPostWhere(), tags: { some: { tagId: tag.id } } }, input);
}

export function toCreatedPostDto(post: ApiPost): PostDto {
	return toPostDto(post);
}
export function toCreatedCommentDto(comment: {
	id: string;
	postId: string;
	parentId: string | null;
	content: string;
	createdAt: string;
	updatedAt: string;
	user: { id: string; username: string; displayName: string; avatarUrl: string | null };
}): CommentDto {
	return {
		id: comment.id,
		postId: comment.postId,
		parentId: comment.parentId,
		content: comment.content,
		author: {
			id: comment.user.id,
			username: comment.user.username,
			displayName: comment.user.displayName,
			avatarUrl: comment.user.avatarUrl,
			bio: null,
			postCount: 0,
			followerCount: 0,
			followingCount: 0,
			following: false,
			createdAt: comment.createdAt
		},
		likeCount: 0,
		liked: false,
		createdAt: comment.createdAt,
		updatedAt: comment.updatedAt
	};
}
