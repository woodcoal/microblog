import { prisma } from '@/lib/db';
import { checkPostVisibility } from '@/lib/visibility';
import { findFollow } from '@/lib/social';

interface Viewer {
	userId: string;
	role: string;
}

/** 返回可见 Media；所有拒绝分支统一返回 null，避免资源探测。 */
export async function getVisibleMedia(mediaId: string, viewer: Viewer | null, password?: string) {
	const media = await prisma.media.findUnique({
		where: { id: mediaId },
		include: {
			fileStorage: true,
			post: {
				select: {
					userId: true,
					visibility: true,
					passwordHash: true,
					allowedUserIds: true,
					isDeleted: true
				}
			}
		}
	});
	if (!media) return null;
	const privileged = !!viewer && (viewer.userId === media.post.userId || viewer.role === 'admin');
	if (media.post.isDeleted && !privileged) return null;
	if (privileged) return media;

	let isFollower = false;
	let isFollowing = false;
	if (viewer) {
		const [followsAuthor, authorFollowsViewer] = await Promise.all([
			findFollow({
				followerId_followingId: {
					followerId: viewer.userId,
					followingId: media.post.userId
				}
			}),
			findFollow({
				followerId_followingId: {
					followerId: media.post.userId,
					followingId: viewer.userId
				}
			})
		]);
		isFollower = !!followsAuthor;
		isFollowing = !!authorFollowsViewer;
	}
	const visible = await checkPostVisibility(
		media.post,
		viewer ? { userId: viewer.userId } : null,
		{ password, isFollower, isFollowing }
	);
	return visible ? media : null;
}
