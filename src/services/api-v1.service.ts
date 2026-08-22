/** /api/v1 查询与 DTO 适配；不依赖 Astro transport。 */
import { renderMarkdown } from '@/lib/markdown';
import { ServiceError } from '@/lib/errors';
import { countPosts, findApiPost, findApiPosts } from '@/lib/post';
import { countApiComments, findApiComments } from '@/lib/comment';
import { countApiUsers, findApiUser, findApiUsers } from '@/lib/user';
import { findFollowerIds, findFollowingIds } from '@/lib/social';
import { findTagByName } from '@/lib/tag';
import { checkPostVisibility, getVisibilityFilter } from '@/lib/visibility';
import { getTrendingFeed } from '@/services/recommend.service';
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

function toPostDto(post: ApiPost, contentRestricted = false): PostDto {
	const mode = post.mode === 'forum' || post.mode === 'blog' ? post.mode : 'weibo';
	const bodyMedia = contentRestricted
		? []
		: post.media
				.filter(
					(media) =>
						media.slot === null &&
						(media.fileStorage.fileType === 'image' ||
							media.fileStorage.fileType === 'video')
				)
				.map((media) => ({
					id: media.id,
					url:
						media.fileStorage.fileType === 'video'
							? `/media/${media.id}/stream`
							: `/media/${media.id}/display`,
					...(media.fileStorage.fileType === 'image'
						? { displayUrl: `/media/${media.id}/display` }
						: { streamUrl: `/media/${media.id}/stream` }),
					mimeType: media.fileStorage.mimeType,
					size: media.fileStorage.fileSize,
					type: media.fileStorage.fileType as 'image' | 'video',
					slot: null
				}));
	const thumbnailMedia = contentRestricted
		? undefined
		: post.media.find((media) => media.slot === 'thumbnail');
	const thumbnail = thumbnailMedia
		? {
				id: thumbnailMedia.id,
				url: `/media/${thumbnailMedia.id}/display`,
				displayUrl: `/media/${thumbnailMedia.id}/display`,
				mimeType: thumbnailMedia.fileStorage.mimeType,
				size: thumbnailMedia.fileStorage.fileSize,
				type: 'image' as const,
				slot: 'thumbnail' as const
			}
		: null;
	const attachments = contentRestricted
		? []
		: post.media
				.filter(
					(media) => media.slot === null && media.fileStorage.fileType === 'attachment'
				)
				.map((media) => ({
					id: media.id,
					url: `/media/${media.id}/download`,
					downloadUrl: `/media/${media.id}/download`,
					originalName: media.originalName,
					mimeType: media.fileStorage.mimeType,
					size: media.fileStorage.fileSize,
					type: 'attachment' as const,
					slot: null
				}));
	return {
		id: post.id,
		title: post.title,
		customCategory: post.customCategory,
		content: contentRestricted ? '[受限内容]' : post.content,
		contentHtml: contentRestricted ? '' : renderMarkdown(post.content),
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
		// v1 兼容字段继续仅表示正文图片；新资产使用下列显式字段。
		media: bodyMedia,
		thumbnail,
		bodyMedia,
		attachments,
		tags: post.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
		createdAt: post.createdAt.toISOString(),
		updatedAt: post.updatedAt.toISOString()
	};
}

/** password 帖子在列表中只暴露受保护标记和非正文元数据。 */
async function toListPostDto(post: ApiPost, viewerId?: string): Promise<PostDto> {
	if (post.visibility === 'password' && post.userId !== viewerId) return toPostDto(post, true);

	// users 帖子保留在列表中作为受限内容提示，但不向未获授权者泄露正文。
	if (post.visibility === 'users' && post.userId !== viewerId) {
		const visible = await checkPostVisibility(
			{
				visibility: post.visibility,
				userId: post.userId,
				allowedUserIds: post.allowedUserIds
			},
			viewerId ? { userId: viewerId } : null
		);
		return toPostDto(post, !visible);
	}

	return toPostDto(post);
}

function toCommentDto(comment: ApiComment): CommentDto {
	const deletedAuthor = Boolean(comment.user.deletedAt);
	return {
		id: comment.id,
		postId: comment.postId,
		parentId: comment.parentId,
		content: comment.content,
		author: deletedAuthor
			? {
					id: 'deleted-user',
					username: 'deleted-user',
					displayName: '已注销用户',
					avatarUrl: null,
					bio: null,
					postCount: 0,
					followerCount: 0,
					followingCount: 0,
					following: false,
					createdAt: comment.createdAt.toISOString()
				}
			: toUserDto(comment.user),
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
	return {
		items: await Promise.all(posts.map((post) => toListPostDto(post, input.viewerId))),
		total,
		page: input.page,
		pageSize: input.pageSize
	};
}

async function visiblePostWhere(viewerId?: string): Promise<Prisma.PostWhereInput> {
	if (!viewerId) return { isDeleted: false, ...getVisibilityFilter(null) };

	const [followingIds, followerIds] = await Promise.all([
		findFollowingIds(viewerId),
		findFollowerIds(viewerId)
	]);
	return {
		isDeleted: false,
		...getVisibilityFilter({ userId: viewerId }, { followingIds, followerIds })
	};
}

export async function getPublicPosts(input: PageInput & { sort?: 'latest' | 'hot' }) {
	if (input.sort === 'hot') {
		const feed = await getTrendingFeed({
			viewerId: input.viewerId,
			page: input.page,
			pageSize: input.pageSize
		});
		if (feed.items.length === 0)
			return { items: [], total: feed.total, page: input.page, pageSize: input.pageSize };
		const visibleWhere = await visiblePostWhere(input.viewerId);
		const records = await findApiPosts(
			{ ...visibleWhere, id: { in: feed.items.map((item) => item.id) } },
			{
				skip: 0,
				take: feed.items.length,
				orderBy: { createdAt: 'desc' },
				viewerId: input.viewerId
			}
		);
		const byId = new Map(records.map((record) => [record.id, record]));
		return {
			items: await Promise.all(
				feed.items.flatMap((item) => {
					const record = byId.get(item.id);
					return record ? [toListPostDto(record, input.viewerId)] : [];
				})
			),
			total: feed.total,
			page: input.page,
			pageSize: input.pageSize
		};
	}
	return getPostPage(await visiblePostWhere(input.viewerId), input, input.sort);
}

export async function getPublicPost(
	postId: string,
	viewerId?: string,
	password?: string
): Promise<PostDto> {
	const post = await findApiPost(postId, viewerId);
	if (!post || post.isDeleted) throw new ServiceError('NOT_FOUND', '帖子不存在');

	let isFollower = false;
	let isFollowing = false;
	if (viewerId && viewerId !== post.userId) {
		const [followingIds, followerIds] = await Promise.all([
			findFollowingIds(viewerId),
			findFollowerIds(viewerId)
		]);
		isFollower = followingIds.includes(post.userId);
		isFollowing = followerIds.includes(post.userId);
	}

	const visible = await checkPostVisibility(
		{
			visibility: post.visibility,
			userId: post.userId,
			passwordHash: post.passwordHash,
			allowedUserIds: post.allowedUserIds
		},
		viewerId ? { userId: viewerId } : null,
		{ password, isFollower, isFollowing }
	);
	if (!visible) throw new ServiceError('NOT_FOUND', '帖子不存在');
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
	input: PageInput & { password?: string }
): Promise<PageDto<CommentDto>> {
	await getPublicPost(postId, input.viewerId, input.password);
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
	return getPostPage({ ...(await visiblePostWhere(input.viewerId)), userId: user.id }, input);
}

export async function getFollowingTimeline(userId: string, input: Omit<PageInput, 'viewerId'>) {
	const followingIds = await findFollowingIds(userId);
	return getPostPage(
		{ ...(await visiblePostWhere(userId)), userId: { in: [userId, ...followingIds] } },
		{ ...input, viewerId: userId }
	);
}

export async function searchPublicPosts(query: string, input: PageInput) {
	if (!query.trim()) throw new ServiceError('BAD_REQUEST', 'q 不能为空');
	return getPostPage(
		{
			AND: [
				await visiblePostWhere(input.viewerId),
				{ OR: [{ content: { contains: query } }, { title: { contains: query } }] }
			]
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
	return getPostPage(
		{ ...(await visiblePostWhere(input.viewerId)), tags: { some: { tagId: tag.id } } },
		input
	);
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
