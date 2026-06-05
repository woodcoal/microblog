/**
 * 点赞按钮组件
 *
 * 显示点赞数和当前点赞状态，点击切换点赞。
 * 点赞时心形变红并有缩放动画。
 */
import { useState } from 'react';

/**
 * LikeButton 组件属性
 *
 * @property postId - 帖子 ID（帖子点赞时使用）
 * @property commentId - 评论 ID（评论点赞时使用）
 * @property initialLiked - 初始是否已点赞
 * @property initialLikeCount - 初始点赞数
 */
interface LikeButtonProps {
	postId?: string;
	commentId?: string;
	initialLiked: boolean;
	initialLikeCount: number;
}

/**
 * 点赞按钮组件
 *
 * 点击调用 PUT /api/posts/:id/like 切换点赞状态。
 * 乐观更新 UI，请求失败时回滚。
 * 点赞时心形变红并有弹跳动画。
 *
 * @param props - 组件属性
 * @returns 点赞按钮 JSX
 */
export default function LikeButton({
	postId,
	commentId,
	initialLiked,
	initialLikeCount
}: LikeButtonProps) {
	const [liked, setLiked] = useState(initialLiked);
	const [likeCount, setLikeCount] = useState(initialLikeCount);
	const [animating, setAnimating] = useState(false);
	const [loading, setLoading] = useState(false);

	// 根据传入的 ID 类型确定 API 路径
	const apiPath = commentId ? `/api/comments/${commentId}/like` : `/api/posts/${postId}/like`;

	/**
	 * 切换点赞状态
	 *
	 * 1. 乐观更新 UI
	 * 2. 发送 PUT 请求
	 * 3. 失败时回滚
	 */
	const handleLike = async () => {
		if (loading) return;

		// 乐观更新
		const prevLiked = liked;
		const prevCount = likeCount;
		setLiked(!prevLiked);
		setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
		setLoading(true);

		// 点赞时触发动画
		if (!prevLiked) {
			setAnimating(true);
			setTimeout(() => setAnimating(false), 400);
		}

		try {
			// 优先从 localStorage 获取 token，不存在时依赖 cookie 认证
			const token = localStorage.getItem('token');

			const res = await fetch(apiPath, {
				method: 'PUT',
				headers: token ? { Authorization: `Bearer ${token}` } : undefined
			});

			const data = await res.json();

			if (data.success) {
				// 以服务端返回为准
				setLiked(data.data.liked);
				setLikeCount(data.data.likeCount);
				// 通知页面点赞状态变更，用于刷新点赞用户列表
				window.dispatchEvent(
					new CustomEvent('post-like-changed', {
						detail: { postId, liked: data.data.liked }
					})
				);
			} else if (res.status === 401) {
				// 未登录回滚并跳转
				setLiked(prevLiked);
				setLikeCount(prevCount);
				window.location.href = '/login';
			} else {
				// 请求失败回滚
				setLiked(prevLiked);
				setLikeCount(prevCount);
			}
		} catch {
			// 网络错误回滚
			setLiked(prevLiked);
			setLikeCount(prevCount);
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			type="button"
			className={`like-btn ${liked ? 'like-btn-liked' : ''} ${animating ? 'like-btn-animate' : ''}`}
			onClick={handleLike}
			disabled={loading}
			aria-label={liked ? '取消点赞' : '点赞'}
		>
			<svg
				className="like-icon"
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill={liked ? 'currentColor' : 'none'}
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
			</svg>
			<span className="like-count">{likeCount}</span>
		</button>
	);
}
