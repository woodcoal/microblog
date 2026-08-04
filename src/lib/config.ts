/**
 * 环境变量与配置常量
 *
 * 统一管理所有配置项，避免在业务代码中直接读取环境变量。
 * 未设置的环境变量使用默认值。
 *
 * 重要：Astro/Vite 通过 import.meta.env 加载 .env 文件变量，
 * process.env 仅包含系统级环境变量。因此所有 .env 变量
 * 必须通过 import.meta.env 读取。
 */

/**
 * 获取环境变量值
 *
 * 优先从 import.meta.env（Astro/Vite 加载的 .env 变量）读取，
 * 回退到 process.env（系统环境变量，用于非 Astro 上下文如 CLI 脚本）。
 *
 * @param key - 环境变量名
 * @returns 变量值字符串，未设置时返回 undefined
 */
export function getEnv(key: string): string | undefined {
	// import.meta.env 由 Vite 在构建时注入 .env 文件变量
	if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
		return import.meta.env[key] as string;
	}
	// 回退到 process.env（系统环境变量或 dotenv 加载的变量）
	// 浏览器端没有 process 对象，需要安全访问
	if (typeof process !== 'undefined' && process.env && key in process.env) {
		return process.env[key];
	}
	return undefined;
}

/**
 * 安全读取数值型环境变量
 *
 * 使用 Number.isFinite 校验，避免 Number() || default 对值 0 处理不正确的问题。
 * 例如：Number('0') || 10 会错误返回 10，而 envNumber('KEY', 10) 正确返回 0。
 *
 * @param key - 环境变量名
 * @param defaultValue - 解析失败或未设置时的默认值
 * @returns 解析后的数值，或默认值
 */
function envNumber(key: string, defaultValue: number): number {
	const v = Number(getEnv(key));
	return Number.isFinite(v) ? v : defaultValue;
}

/** 数据库连接字符串 */
export const DATABASE_URL = getEnv('DATABASE_URL') ?? 'file:./dev.db';

/** JWT 签名密钥 */
export const JWT_SECRET =
	getEnv('JWT_SECRET') ??
	(() => {
		console.warn(
			'[警告] JWT_SECRET 未设置，使用默认开发密钥。生产环境请务必配置 JWT_SECRET 环境变量！'
		);
		return 'mutan-dev-secret-change-in-production';
	})();

/** JWT 有效期（天） */
export const JWT_EXPIRES_DAYS = envNumber('JWT_EXPIRES_DAYS', 7);

/** 文件上传目录 */
export const UPLOAD_DIR = getEnv('UPLOAD_DIR') ?? './uploads';

/** 站点 URL，用于生成绝对链接 */
export const SITE_URL = getEnv('SITE_URL') ?? 'http://localhost:4321';

/** Agent 帖子热门排序时参与评分的最新候选数量。 */
export const HOT_SORT_CANDIDATE_WINDOW = Math.max(
	1,
	Math.floor(envNumber('HOT_SORT_CANDIDATE_WINDOW', 200))
);

/** 内置保留用户名，禁止注册（不可覆盖） */
const BUILTIN_RESERVED_USERNAMES = [
	'login',
	'register',
	'admin',
	'search',
	'api',
	'following',
	'followers',
	'notifications',
	'settings',
	'tags',
	'latest',
	'about',
	'help',
	'terms',
	'privacy',
	'contact',
	'sitemap',
	'robots',
	'favicon',
	'assets',
	'public',
	'static',
	'uploads',
	'docs',
	'post',
	'posts',
	'user',
	'users',
	'comment',
	'comments',
	'like',
	'likes',
	'follow',
	'follows',
	'tag',
	'notification',
	'setting',
	'token',
	'tokens',
	'webhook',
	'webhooks',
	'timeline',
	'new',
	'edit',
	'delete',
	'create',
	'update',
	'restore',
	'pin',
	'lock',
	'unlock',
	'hide',
	'show',
	'disable',
	'enable',
	'activity',
	'log',
	'logs',
	'revision',
	'revisions',
	'mention',
	'mentions',
	'media',
	'upload',
	'site',
	'dashboard',
	'index',
	'home',
	'explore',
	'trending',
	'popular',
	'hot',
	'all',
	'me',
	'profile',
	'account',
	'password',
	'email',
	'username',
	'avatar',
	'bio',
	'theme',
	'dark',
	'light',
	// 频道路由保留词，防止与频道页路由冲突
	'weibo',
	'forum',
	'blog'
] as const;

/**
 * 系统保留用户名列表
 *
 * 合并内置保留词和 .env 中 EXTRA_RESERVED_USERNAMES 追加的保留词。
 * .env 格式：逗号分隔，如 EXTRA_RESERVED_USERNAMES="test,moderator,system"
 * 内置保留词不可覆盖，.env 追加的保留词会去重合并。
 */
const extraReserved = (getEnv('EXTRA_RESERVED_USERNAMES') ?? '')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);

export const RESERVED_USERNAMES: readonly string[] = [
	...new Set([...BUILTIN_RESERVED_USERNAMES, ...extraReserved])
];

/** 用户名格式：字母数字下划线，3-20 字符 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/** 密码最小长度 */
export const PASSWORD_MIN_LENGTH = 8;

/** 帖子内容最大长度 */
export const POST_CONTENT_MAX_LENGTH = 1000;

/** 站点标题 */
export const SITE_TITLE = getEnv('SITE_TITLE') ?? '睦谈';

/** 站点描述 */
export const SITE_DESCRIPTION = getEnv('SITE_DESCRIPTION') ?? '世间纷纷扰扰，此处和睦相谈';

/** 站点 Logo URL，未设置时读取 public/logo.svg */
export const SITE_LOGO_URL = getEnv('SITE_LOGO_URL') || '/logo.svg';

/** 站点 Favicon URL，未设置时读取 public/favicon.svg */
export const SITE_FAVICON_URL = getEnv('SITE_FAVICON_URL') || '/favicon.svg';

/** 是否允许注册 */
export const ALLOW_REGISTRATION = getEnv('ALLOW_REGISTRATION') !== 'false';

/** 被禁用用户提示信息 */
export const DISABLED_USER_MESSAGE = getEnv('DISABLED_USER_MESSAGE') ?? '该用户已被禁用';

/** 全局置顶帖上限 */
export const MAX_GLOBAL_PINNED_POSTS = envNumber('MAX_GLOBAL_PINNED_POSTS', 3);

/** 用户置顶帖上限 */
export const MAX_USER_PINNED_POSTS = envNumber('MAX_USER_PINNED_POSTS', 1);

/** 解析启用的站点模式 */
export const SITE_MODES = (getEnv('SITE_MODES') || 'weibo')
	.split(',')
	.map((m) => m.trim())
	.filter((m): m is string => ['weibo', 'forum', 'blog'].includes(m));

/**
 * 模式别名配置
 *
 * 通过环境变量 SITE_MODE_WEIBO / SITE_MODE_FORUM / SITE_MODE_BLOG
 * 自定义各模式的显示名称。未设置时使用默认名称。
 *
 * 示例：SITE_MODE_BLOG=知识库 → 博客模块全站显示为"知识库"
 */
const MODE_LABELS: Record<string, string> = {
	weibo: getEnv('SITE_MODE_WEIBO') || '微博',
	forum: getEnv('SITE_MODE_FORUM') || '论坛',
	blog: getEnv('SITE_MODE_BLOG') || '博客'
};

/**
 * 获取模式的显示别名
 *
 * @param mode - 模式标识（weibo / forum / blog）
 * @returns 显示名称，未配置时回退到默认名称
 */
export function getModeLabel(mode: string): string {
	return MODE_LABELS[mode] || mode;
}

/** 是否启用某模式 */
export const isModeEnabled = (mode: string): boolean => SITE_MODES.includes(mode);

/** 是否为单模式站点 */
export const isSingleMode = SITE_MODES.length === 1;

/** 单模式时的模式值 */
export const singleMode = isSingleMode ? SITE_MODES[0] : null;

/** DaLi.Lens 推荐与搜索中间件服务地址（未设置时全局停用推荐功能） */
export const LENS_ENDPOINT = getEnv('LENS_ENDPOINT') ?? '';

/** DaLi.Lens 渠道 API Key（必填，用于认证） */
export const LENS_API_KEY = getEnv('LENS_API_KEY') ?? '';
