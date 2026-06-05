/**
 * @file SearchSuggest.tsx
 * @description 搜索建议下拉组件 - 根据用户输入实时展示标签和用户建议
 * 当搜索框输入变化时，防抖 300ms 后请求 /api/search/suggest 接口，
 * 展示匹配的标签和用户列表，支持 Escape 关闭和点击外部关闭。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/** 标签建议项 */
interface TagSuggest {
	id: string;
	name: string;
	postCount: number;
}

/** 用户建议项 */
interface UserSuggest {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
}

/** 接口返回的建议数据 */
interface SuggestData {
	tags: TagSuggest[];
	users: UserSuggest[];
}

/** 组件属性 */
interface SearchSuggestProps {
	/** 初始搜索关键词（从 URL 参数获取） */
	initialQuery?: string;
}

/**
 * SearchSuggest - 搜索建议下拉组件
 *
 * @param props.initialQuery - 从 URL 参数获取的初始搜索关键词
 * @functionality 根据输入内容防抖请求建议接口，展示标签和用户两类结果
 * @behavior 输入为空或无结果时不展示；Escape 键或点击外部关闭下拉
 */
export default function SearchSuggest({ initialQuery = '' }: SearchSuggestProps) {
	/** 当前搜索输入值（从搜索框实时同步） */
	const [query, setQuery] = useState(initialQuery);
	/** 建议数据 */
	const [data, setData] = useState<SuggestData | null>(null);
	/** 加载状态 */
	const [loading, setLoading] = useState(false);
	/** 下拉是否可见 */
	const [visible, setVisible] = useState(false);
	/** 组件根元素引用，用于检测外部点击 */
	const containerRef = useRef<HTMLDivElement>(null);
	/** 防抖定时器引用 */
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	/** 判断是否有建议结果 */
	const hasResults = !!(data && (data.tags.length > 0 || data.users.length > 0));

	/**
	 * 监听搜索框的 input 事件，实时同步 query 值
	 * 搜索框是 Astro SSR 组件，不在 React 控制范围内，
	 * 因此通过 DOM 事件监听来同步输入值。
	 */
	useEffect(() => {
		const searchInput = document.querySelector('.search-input') as HTMLInputElement | null;
		if (!searchInput) return;

		const handleInput = () => {
			setQuery(searchInput.value);
		};
		searchInput.addEventListener('input', handleInput);
		return () => searchInput.removeEventListener('input', handleInput);
	}, []);

	/**
	 * 关闭下拉面板
	 * 隐藏下拉但不清除数据，下次输入时可快速恢复
	 */
	const close = useCallback(() => {
		setVisible(false);
	}, []);

	/**
	 * 核心副作用：监听 query 变化，防抖请求建议接口
	 * - 输入为空时立即隐藏并清空数据
	 * - 300ms 无新输入后发起请求
	 * - 请求期间设置 loading 状态
	 * - 组件卸载时清除定时器
	 */
	useEffect(() => {
		// 清除上一次的防抖定时器
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}

		// 输入为空，隐藏下拉并清空数据
		if (!query.trim()) {
			setData(null);
			setVisible(false);
			setLoading(false);
			return;
		}

		setLoading(true);

		// 防抖 300ms 后发起请求
		timerRef.current = setTimeout(async () => {
			try {
				const res = await fetch(
					`/api/search/suggest?q=${encodeURIComponent(query.trim())}`
				);
				const json = await res.json();

				if (json.success && json.data) {
					setData(json.data);
					setVisible(true);
				} else {
					setData(null);
					setVisible(false);
				}
			} catch {
				// 请求失败时静默处理，不影响用户搜索体验
				setData(null);
				setVisible(false);
			} finally {
				setLoading(false);
			}
		}, 300);

		// 清理函数：组件卸载或 query 再次变化时清除定时器
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [query]);

	/**
	 * 监听 Escape 键关闭下拉
	 * 仅在组件挂载时绑定一次，卸载时移除
	 */
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				close();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [close]);

	/**
	 * 监听点击外部关闭下拉
	 * 点击不在组件内的区域时关闭下拉
	 */
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				close();
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [close]);

	// 不满足展示条件时不渲染
	if (!query.trim() || (!loading && !hasResults)) {
		return null;
	}

	return (
		<div ref={containerRef} className="search-suggest">
			{/* 加载状态提示 */}
			{loading && <div className="search-suggest-loading">搜索中...</div>}

			{/* 建议结果列表 */}
			{!loading && data && (
				<>
					{/* 标签建议区 */}
					{data.tags.length > 0 && (
						<div className="search-suggest-section">
							<div className="search-suggest-section-title">标签</div>
							{data.tags.map((tag) => (
								<a
									key={tag.id}
									href={`/tags/${encodeURIComponent(tag.name)}`}
									className="search-suggest-tag"
								>
									#{tag.name}#
								</a>
							))}
						</div>
					)}

					{/* 用户建议区 */}
					{data.users.length > 0 && (
						<div className="search-suggest-section">
							<div className="search-suggest-section-title">用户</div>
							{data.users.map((user) => (
								<a
									key={user.id}
									href={`/${user.username}`}
									className="search-suggest-user"
								>
									{user.avatarUrl && (
										<img
											src={user.avatarUrl}
											alt={user.displayName}
											className="search-suggest-user-avatar"
										/>
									)}
									<span className="search-suggest-user-info">
										<span className="search-suggest-user-name">
											{user.displayName}
										</span>
										<span className="search-suggest-user-handle">
											@{user.username}
										</span>
									</span>
								</a>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
