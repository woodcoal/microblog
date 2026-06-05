/**
 * 关注按钮组件
 *
 * 显示关注/取关状态，点击切换关注。
 * 当目标是自己时隐藏按钮。
 */
import { useState } from 'react';

/**
 * FollowButton 组件属性
 *
 * @property username - 目标用户名
 * @property initialFollowing - 初始是否已关注
 * @property isSelf - 是否是自己（自己时隐藏按钮）
 */
interface FollowButtonProps {
	username: string;
	initialFollowing: boolean;
	isSelf: boolean;
}

/**
 * 关注按钮组件
 *
 * 点击调用 PUT /api/users/:username/follow 切换关注状态。
 * 乐观更新 UI，请求失败时回滚。
 * 自己时隐藏按钮。
 *
 * @param props - 组件属性
 * @returns 关注按钮 JSX
 */
export default function FollowButton({ username, initialFollowing, isSelf }: FollowButtonProps) {
	const [following, setFollowing] = useState(initialFollowing);
	const [loading, setLoading] = useState(false);

	// 自己时隐藏按钮
	if (isSelf) return null;

	/**
	 * 切换关注状态
	 *
	 * 1. 乐观更新 UI
	 * 2. 发送 PUT 请求
	 * 3. 失败时回滚
	 */
	const handleFollow = async () => {
		if (loading) return;

		// 乐观更新
		const prevFollowing = following;
		setFollowing(!prevFollowing);
		setLoading(true);

		try {
			// 优先从 localStorage 获取 token，不存在时依赖 cookie 认证
			const token = localStorage.getItem('token');

			const res = await fetch(`/api/users/${username}/follow`, {
				method: 'PUT',
				headers: token ? { Authorization: `Bearer ${token}` } : undefined
			});

			const data = await res.json();

			if (data.success) {
				// 以服务端返回为准
				setFollowing(data.data.following);
			} else if (res.status === 401) {
				// 未登录回滚并跳转
				setFollowing(prevFollowing);
				window.location.href = '/login';
			} else {
				// 请求失败回滚
				setFollowing(prevFollowing);
			}
		} catch {
			// 网络错误回滚
			setFollowing(prevFollowing);
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			type="button"
			className={following ? 'btn btn-outline follow-btn' : 'btn btn-primary follow-btn'}
			onClick={handleFollow}
			disabled={loading}
			aria-label={following ? '取消关注' : '关注'}
		>
			{following ? '已关注' : '关注'}
		</button>
	);
}
