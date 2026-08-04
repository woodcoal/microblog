/**
 * Astro 环境变量类型声明
 *
 * 声明 .env 文件中自定义变量的类型，使 import.meta.env 有类型提示。
 * 参考：https://docs.astro.build/zh-cn/guides/environment-variables/
 */

interface ImportMetaEnv {
	/** 数据库连接字符串 */
	readonly DATABASE_URL?: string;
	/** JWT 签名密钥 */
	readonly JWT_SECRET?: string;
	/** JWT 有效期（天） */
	readonly JWT_EXPIRES_DAYS?: string;
	/** 文件上传目录 */
	readonly UPLOAD_DIR?: string;
	/** 站点 URL */
	readonly SITE_URL?: string;
	/** 站点标题 */
	readonly SITE_TITLE?: string;
	/** 站点描述 */
	readonly SITE_DESCRIPTION?: string;
	/** 站点 Logo URL（留空则使用 public/logo.svg） */
	readonly SITE_LOGO_URL?: string;
	/** 站点 Favicon URL（留空则使用 public/favicon.svg） */
	readonly SITE_FAVICON_URL?: string;
	/** 是否允许注册 */
	readonly ALLOW_REGISTRATION?: string;
	/** 密码保护过期时间（分钟） */
	readonly PASSWORD_PROTECT_EXPIRE_MINUTES?: string;
	/** 被禁用用户提示信息 */
	readonly DISABLED_USER_MESSAGE?: string;
	/** 全局置顶帖上限 */
	readonly MAX_GLOBAL_PINNED_POSTS?: string;
	/** 用户置顶帖上限 */
	readonly MAX_USER_PINNED_POSTS?: string;
	/** 热门排序公式配置 */
	readonly TRENDING_FORMULA?: string;
	/** 额外保留用户名（逗号分隔） */
	readonly EXTRA_RESERVED_USERNAMES?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface MutanDialogOptions {
	title?: string;
	danger?: boolean;
}

interface MutanDialogApi {
	alert(message: string, options?: MutanDialogOptions): Promise<void>;
	confirm(message: string, options?: MutanDialogOptions): Promise<boolean>;
}

declare const MutanDialog: MutanDialogApi;

declare const Scalar: {
	createApiReference(target: string, options: object): void;
};

interface Window {
	MutanDialog: MutanDialogApi;
}
