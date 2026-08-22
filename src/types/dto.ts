/** 对外 /api/v1 JSON API 的 transport-agnostic DTO。 */
export interface UserDto {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	bio: string | null;
	postCount: number;
	followerCount: number;
	followingCount: number;
	following: boolean;
	createdAt: string;
}

export interface MediaDto {
	id: string;
	url: string;
	mimeType: string;
	size: number;
	type: 'image' | 'video' | 'attachment';
	slot: 'thumbnail' | null;
	displayUrl?: string;
	streamUrl?: string;
}

export interface AttachmentDto extends MediaDto {
	originalName: string;
	downloadUrl: string;
}

export type AdminAuditAction =
	| 'user.disable'
	| 'user.enable'
	| 'user.purge_unverified_empty'
	| 'post.delete'
	| 'post.restore'
	| 'post.lock'
	| 'post.unlock'
	| 'post.pin'
	| 'post.unpin'
	| 'comment.delete';

export interface AdminAuditLogDto {
	id: string;
	action: AdminAuditAction;
	targetType: 'user' | 'post' | 'comment';
	reason: string;
	result: 'success';
	requestedCount: number;
	affectedCount: number;
	createdAt: string;
	operator: { id: string; username: string; displayName: string; avatarUrl: string | null };
	targets: Array<{ targetId: string; outcome: 'updated' | 'unchanged' }>;
}
export interface TagDto {
	id: string;
	name: string;
}
export interface PostDto {
	id: string;
	title: string | null;
	customCategory: string | null;
	content: string;
	contentHtml: string;
	mode: 'weibo' | 'forum' | 'blog';
	visibility: string;
	author: UserDto;
	likeCount: number;
	commentCount: number;
	liked: boolean;
	isPinned: boolean;
	isLocked: boolean;
	isEdited: boolean;
	isPasswordProtected: boolean;
	media: MediaDto[];
	thumbnail: MediaDto | null;
	bodyMedia: MediaDto[];
	attachments: AttachmentDto[];
	tags: TagDto[];
	createdAt: string;
	updatedAt: string;
}
export interface CommentDto {
	id: string;
	postId: string;
	parentId: string | null;
	content: string;
	author: UserDto;
	likeCount: number;
	liked: boolean;
	createdAt: string;
	updatedAt: string;
}
export interface PageDto<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
}
