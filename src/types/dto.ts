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
	type: 'image' | 'attachment';
}
export interface TagDto {
	id: string;
	name: string;
}
export interface PostDto {
	id: string;
	title: string | null;
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
