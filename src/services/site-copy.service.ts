/**
 * 站点固定文案服务。
 *
 * 公共读取始终降级到代码内默认值，不将后台审计字段带到前端。
 */
import { renderSiteCopyMarkdown } from '@/lib/markdown';
import { findSiteCopy, findSiteCopyVersions, saveSiteCopyWithVersion } from '@/lib/site-copy';
import { ServiceError } from '@/lib/errors';

export const SITE_COPY_KEYS = ['home.hero', 'auth.login.intro', 'auth.register.intro'] as const;

export type SiteCopyKey = (typeof SITE_COPY_KEYS)[number];

export const DEFAULT_SITE_COPY: Record<SiteCopyKey, string> = {
	'home.hero':
		'轻量、多元、自在\n\n# 在同一个社区，聊聊你关心的事。\n\n微博记录当下，论坛展开讨论，博客沉淀观点。发现值得停留的内容，也分享你的声音。',
	'auth.login.intro':
		'轻量、多元、自在\n\n# 把想说的，交给愿意听的人。\n\n在微博记录当下，在论坛展开讨论，在博客沉淀观点。',
	'auth.register.intro':
		'加入睦谈\n\n# 在这里，留下一点有用的声音。\n\n选择适合的表达方式，让一段想法获得持续的回应。'
};

export interface PublicSiteCopy {
	key: SiteCopyKey;
	markdown: string;
	html: string;
	updatedAt: string | null;
}

export interface AdminSiteCopy extends PublicSiteCopy {
	updatedById: string | null;
}

export interface SiteCopyVersion {
	id: string;
	key: SiteCopyKey;
	markdown: string;
	updatedById: string;
	updatedAt: string;
}

export function isSiteCopyKey(key: string): key is SiteCopyKey {
	return (SITE_COPY_KEYS as readonly string[]).includes(key);
}

function requireSiteCopyKey(key: string): asserts key is SiteCopyKey {
	if (!isSiteCopyKey(key)) throw new ServiceError('BAD_REQUEST', '不支持的站点文案键');
}

function toPublicSiteCopy(key: SiteCopyKey, record: { markdown: string; updatedAt: Date } | null) {
	const markdown = record?.markdown ?? DEFAULT_SITE_COPY[key];
	return {
		key,
		markdown,
		html: renderSiteCopyMarkdown(markdown),
		updatedAt: record?.updatedAt.toISOString() ?? null
	};
}

/** 公共契约：读取单个白名单文案，不暴露编辑者信息。 */
export async function getPublicSiteCopy(key: string): Promise<PublicSiteCopy> {
	requireSiteCopyKey(key);
	try {
		return toPublicSiteCopy(key, await findSiteCopy(key));
	} catch {
		// 迁移尚未应用或读取临时失败时仍可渲染页面。
		return toPublicSiteCopy(key, null);
	}
}

/** 公共契约：一次返回全部固定键，方便页面在 SSR 中读取。 */
export async function getPublicSiteCopies(): Promise<PublicSiteCopy[]> {
	return Promise.all(SITE_COPY_KEYS.map((key) => getPublicSiteCopy(key)));
}

/** 管理端读取当前值，包含审计所需的编辑者 ID。 */
export async function getAdminSiteCopy(key: string): Promise<AdminSiteCopy> {
	requireSiteCopyKey(key);
	const record = await findSiteCopy(key);
	return {
		...toPublicSiteCopy(key, record),
		updatedById: record?.updatedById ?? null
	};
}

/** 管理端读取不可变版本历史。 */
export async function getSiteCopyVersions(key: string): Promise<SiteCopyVersion[]> {
	requireSiteCopyKey(key);
	const versions = await findSiteCopyVersions(key);
	return versions.map((version) => ({
		id: version.id,
		key,
		markdown: version.markdown,
		updatedById: version.updatedById,
		updatedAt: version.updatedAt.toISOString()
	}));
}

/** 管理端更新。每次成功更新都会以单事务写入当前值和一条审计版本。 */
export async function updateSiteCopy(input: {
	key: string;
	markdown: string;
	updatedById: string;
}): Promise<AdminSiteCopy> {
	requireSiteCopyKey(input.key);
	if (input.markdown.length > 4000) {
		throw new ServiceError('BAD_REQUEST', '站点文案不能超过 4000 个字符');
	}

	const record = await saveSiteCopyWithVersion({
		key: input.key,
		markdown: input.markdown,
		updatedById: input.updatedById
	});

	return {
		...toPublicSiteCopy(input.key, record),
		updatedById: record.updatedById
	};
}
