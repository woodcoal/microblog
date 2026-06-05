/**
 * 主题切换下拉选择器组件
 *
 * 显示当前主题图标和名称，点击展开下拉菜单选择主题。
 * 选择后更新 DOM 属性、localStorage，已登录时同步到服务端。
 */
import { useState, useEffect, useRef } from 'react';

/** 主题图标映射 */
const THEME_ICONS: Record<string, string> = {
	light: '☀️',
	dark: '🌙',
	'eye-care': '🍃',
	'high-contrast': '🔲'
};

/** 可用主题列表 */
const THEMES = [
	{ id: 'light', name: '亮色' },
	{ id: 'dark', name: '暗色' },
	{ id: 'eye-care', name: '护眼' },
	{ id: 'high-contrast', name: '高对比度' }
] as const;

/** 可用强调色列表 */
const ACCENTS = [
	{ id: 'blue', name: '蓝色', color: '#4f46e5' },
	{ id: 'green', name: '绿色', color: '#16a34a' },
	{ id: 'orange', name: '橙色', color: '#ea580c' },
	{ id: 'purple', name: '紫色', color: '#9333ea' },
	{ id: 'rose', name: '玫红', color: '#e11d48' }
] as const;

/** localStorage 中存储主题的键名 */
const STORAGE_KEY = 'theme';

/** localStorage 中存储强调色的键名 */
const ACCENT_STORAGE_KEY = 'accent';

/**
 * 主题切换组件
 *
 * 初始化时从 localStorage 或 html 元素的 data-theme 属性读取当前主题。
 * 点击按钮展开下拉菜单，选择主题后：
 * 1. 更新 html 元素的 data-theme 属性
 * 2. 存储到 localStorage
 * 3. 已登录时调用 PUT /api/settings 同步到服务端
 * 点击外部区域关闭下拉菜单。
 *
 * @returns 主题切换按钮 JSX
 */
export default function ThemeSwitcher() {
	const [currentTheme, setCurrentTheme] = useState<string>('light');
	const [currentAccent, setCurrentAccent] = useState<string>('');
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	/** 初始化：从 localStorage 或 DOM 读取当前主题和强调色 */
	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		const fromDom = document.documentElement.getAttribute('data-theme');
		const initial = stored || fromDom || 'light';
		setCurrentTheme(initial);

		// 读取强调色偏好
		const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
		const fromDomAccent = document.documentElement.getAttribute('data-accent');
		const initialAccent = storedAccent || fromDomAccent || '';
		setCurrentAccent(initialAccent);
	}, []);

	/** 点击外部区域关闭下拉菜单 + Escape/方向键导航 */
	useEffect(() => {
		if (!open) return;

		/**
		 * 外部点击事件处理
		 *
		 * 点击不在容器内的元素时关闭下拉菜单
		 *
		 * @param e - 鼠标事件
		 */
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};

		/**
		 * 键盘事件处理
		 *
		 * Escape 关闭下拉菜单，上下方向键选择主题
		 *
		 * @param e - 键盘事件
		 */
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setOpen(false);
				return;
			}

			const currentIndex = THEMES.findIndex((t) => t.id === currentTheme);

			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				let newIndex: number;
				if (e.key === 'ArrowDown') {
					// 向下移动，到底则循环到顶部
					newIndex = (currentIndex + 1) % THEMES.length;
				} else {
					// 向上移动，到顶则循环到底部
					newIndex = (currentIndex - 1 + THEMES.length) % THEMES.length;
				}
				handleSelect(THEMES[newIndex].id);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [open, currentTheme]);

	/**
	 * 切换主题
	 *
	 * 更新 DOM、localStorage，已登录时同步到服务端。
	 *
	 * @param themeId - 目标主题 ID
	 */
	const handleSelect = async (themeId: string) => {
		setCurrentTheme(themeId);
		setOpen(false);

		// 更新 DOM 属性
		document.documentElement.setAttribute('data-theme', themeId);

		// 持久化到 localStorage
		localStorage.setItem(STORAGE_KEY, themeId);

		// 已登录时同步到服务端
		const token = localStorage.getItem('token');
		if (token) {
			try {
				await fetch('/api/settings', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`
					},
					body: JSON.stringify({ theme: themeId })
				});
			} catch {
				// 网络错误静默处理，本地已生效
			}
		}
	};

	/**
	 * 切换强调色
	 *
	 * 更新 DOM data-accent 属性、localStorage，已登录时同步到服务端。
	 *
	 * @param accentId - 目标强调色 ID
	 */
	const handleAccentSelect = async (accentId: string) => {
		setCurrentAccent(accentId);

		// 更新 DOM 属性
		document.documentElement.setAttribute('data-accent', accentId);

		// 持久化到 localStorage
		localStorage.setItem(ACCENT_STORAGE_KEY, accentId);

		// 已登录时同步到服务端
		const token = localStorage.getItem('token');
		if (token) {
			try {
				await fetch('/api/settings', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`
					},
					body: JSON.stringify({ accent: accentId })
				});
			} catch {
				// 网络错误静默处理，本地已生效
			}
		}
	};

	return (
		<div className="theme-switcher" ref={containerRef}>
			<button
				type="button"
				className="theme-switcher-btn"
				onClick={() => setOpen(!open)}
				aria-label="切换主题"
				aria-expanded={open}
			>
				<span className="theme-switcher-icon">{THEME_ICONS[currentTheme] || '☀️'}</span>
				<span className="theme-switcher-name">
					{THEMES.find((t) => t.id === currentTheme)?.name || '亮色'}
				</span>
			</button>

			{open && (
				<ul className="theme-switcher-dropdown" role="menu">
					{THEMES.map((theme) => (
						<li key={theme.id} role="menuitem">
							<button
								type="button"
								className={`theme-switcher-option ${currentTheme === theme.id ? 'active' : ''}`}
								onClick={() => handleSelect(theme.id)}
							>
								<span className="theme-switcher-option-icon">
									{THEME_ICONS[theme.id]}
								</span>
								<span className="theme-switcher-option-name">{theme.name}</span>
							</button>
						</li>
					))}
					{/* 强调色分隔线 */}
					<li className="theme-switcher-divider" role="separator" />
					{/* 强调色选择圆点行 */}
					<li className="theme-switcher-accent-row" role="group" aria-label="强调色">
						{ACCENTS.map((a) => (
							<button
								key={a.id}
								type="button"
								className={`theme-switcher-accent-dot ${currentAccent === a.id ? 'active' : ''}`}
								style={{ backgroundColor: a.color }}
								onClick={() => handleAccentSelect(a.id)}
								aria-label={a.name}
								title={a.name}
							/>
						))}
					</li>
				</ul>
			)}
		</div>
	);
}
