/**
 * Emoji 选择器组件
 *
 * 提供常用 emoji 的分类选择面板，点击 emoji 插入到输入框光标位置。
 * 包含分类标签切换，支持键盘 ESC 关闭和点击外部关闭。
 * 内嵌约 200 个常用 emoji，按 9 个分类组织。
 */
import { useState, useEffect, useRef } from 'react';

/** emoji 分类数据（约 200 个常用 emoji） */
const EMOJI_CATEGORIES = [
	{
		name: '表情',
		icon: '😀',
		emojis: [
			'😀',
			'😃',
			'😄',
			'😁',
			'😆',
			'😅',
			'🤣',
			'😂',
			'🙂',
			'😊',
			'😇',
			'🥰',
			'😍',
			'🤩',
			'😘',
			'😋',
			'😛',
			'😜',
			'🤪',
			'😝',
			'🤗',
			'🤭',
			'🤫',
			'🤔',
			'😐',
			'😑',
			'😶',
			'😏',
			'😒',
			'🙄',
			'😬',
			'😌',
			'😔',
			'😪',
			'😴',
			'😷',
			'🤒',
			'🤕',
			'🤢',
			'🤮',
			'🥵',
			'🥶',
			'😵',
			'🤯',
			'🤠',
			'🥳',
			'😎',
			'🤓',
			'🧐'
		]
	},
	{
		name: '手势',
		icon: '👋',
		emojis: [
			'👍',
			'👎',
			'👊',
			'✊',
			'👏',
			'🙌',
			'🤝',
			'🙏',
			'✌️',
			'🤞',
			'🤟',
			'🤘',
			'👌',
			'👈',
			'👉',
			'👆',
			'👇',
			'☝️',
			'✋',
			'🤚',
			'👋',
			'🤙',
			'💪',
			'✍️'
		]
	},
	{
		name: '爱心',
		icon: '❤️',
		emojis: [
			'❤️',
			'🧡',
			'💛',
			'💚',
			'💙',
			'💜',
			'🖤',
			'🤍',
			'💔',
			'❤️‍🔥',
			'❣️',
			'💕',
			'💞',
			'💓',
			'💗',
			'💖',
			'💘',
			'💝'
		]
	},
	{
		name: '动物',
		icon: '🐱',
		emojis: [
			'🐶',
			'🐱',
			'🐭',
			'🐹',
			'🐰',
			'🦊',
			'🐻',
			'🐼',
			'🐨',
			'🐯',
			'🦁',
			'🐮',
			'🐷',
			'🐸',
			'🐵',
			'🐔',
			'🐧',
			'🐦',
			'🐝',
			'🦋',
			'🐌',
			'🐙',
			'🦀',
			'🐬',
			'🐳',
			'🦈'
		]
	},
	{
		name: '食物',
		icon: '🍎',
		emojis: [
			'🍎',
			'🍐',
			'🍊',
			'🍋',
			'🍌',
			'🍉',
			'🍇',
			'🍓',
			'🍑',
			'🥭',
			'🍍',
			'🥥',
			'🍅',
			'🥑',
			'🌶️',
			'🌽',
			'🥕',
			'🍞',
			'🧀',
			'🍳',
			'🍔',
			'🍟',
			'🍕',
			'🌭',
			'🥪',
			'🌮',
			'🍜',
			'🍣',
			'🍦',
			'🍩',
			'🍪',
			'🎂',
			'🍰',
			'🍫',
			'🍭',
			'☕',
			'🍵',
			'🍺',
			'🍷',
			'🥂'
		]
	},
	{
		name: '活动',
		icon: '⚽',
		emojis: [
			'⚽',
			'🏀',
			'🏈',
			'⚾',
			'🎾',
			'🏐',
			'🎱',
			'🏓',
			'🏸',
			'🥊',
			'🤺',
			'🏊',
			'🚴',
			'🏋️',
			'🎯',
			'🎮',
			'🎲',
			'🎭',
			'🎨',
			'🎬',
			'🎤',
			'🎧',
			'🎸',
			'🎹',
			'🥁',
			'🎺'
		]
	},
	{
		name: '自然',
		icon: '🌸',
		emojis: [
			'🌸',
			'🌹',
			'🌺',
			'🌻',
			'🌼',
			'🌷',
			'🌱',
			'🌲',
			'🌳',
			'🌴',
			'🌵',
			'🍀',
			'🍁',
			'🍂',
			'🍃',
			'🌊',
			'❄️',
			'☃️',
			'🔥',
			'🌈',
			'☀️',
			'☁️',
			'🌙',
			'⭐',
			'✨',
			'💫'
		]
	},
	{
		name: '物品',
		icon: '💻',
		emojis: [
			'💻',
			'📱',
			'⌨️',
			'💡',
			'📷',
			'📺',
			'📚',
			'📖',
			'📝',
			'✏️',
			'📌',
			'✂️',
			'🔑',
			'🔒',
			'💰',
			'💎',
			'🎈',
			'🎉',
			'🎊',
			'🎁',
			'🏆',
			'🥇',
			'🎖️'
		]
	},
	{
		name: '符号',
		icon: '✅',
		emojis: [
			'✅',
			'❌',
			'❓',
			'❗',
			'‼️',
			'⭕',
			'🔴',
			'🟠',
			'🟡',
			'🟢',
			'🔵',
			'🟣',
			'⚫',
			'⚪',
			'🔊',
			'🔇',
			'🔔',
			'🔕',
			'♾️',
			'⚠️',
			'♻️',
			'💯',
			'🔰'
		]
	}
];

interface Props {
	/** 选择 emoji 后的回调，参数为选中的 emoji 字符 */
	onSelect: (emoji: string) => void;
	/** 关闭选择器的回调 */
	onClose: () => void;
}

/**
 * Emoji 选择器组件
 *
 * @param onSelect - 选择 emoji 后的回调
 * @param onClose - 关闭选择器的回调
 */
export default function EmojiPicker({ onSelect, onClose }: Props) {
	/** 当前激活的分类索引 */
	const [activeCategory, setActiveCategory] = useState(0);
	/** 组件容器引用，用于检测点击外部关闭 */
	const containerRef = useRef<HTMLDivElement>(null);

	/** ESC 键关闭 */
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	/** 点击外部关闭 */
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		// 延迟添加监听，避免打开时的点击事件立即触发关闭
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose]);

	/** 当前分类的 emoji 列表 */
	const currentEmojis = EMOJI_CATEGORIES[activeCategory].emojis;

	return (
		<div className="emoji-picker" ref={containerRef}>
			{/* 分类标签栏 */}
			<div className="emoji-picker-categories">
				{EMOJI_CATEGORIES.map((cat, i) => (
					<button
						key={cat.name}
						type="button"
						className={`emoji-picker-category-btn ${activeCategory === i ? 'active' : ''}`}
						onClick={() => setActiveCategory(i)}
						title={cat.name}
					>
						{cat.icon}
					</button>
				))}
			</div>

			{/* Emoji 网格 */}
			<div className="emoji-picker-grid">
				<div className="emoji-picker-group">
					<div className="emoji-picker-group-label">
						{EMOJI_CATEGORIES[activeCategory].name}
					</div>
					<div className="emoji-picker-items">
						{currentEmojis.map((emoji, i) => (
							<button
								key={`${emoji}-${i}`}
								type="button"
								className="emoji-picker-item"
								onClick={() => onSelect(emoji)}
								title={emoji}
							>
								{emoji}
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
