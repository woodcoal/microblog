import { SITE_TITLE } from './config';

/** 固定站点文案白名单及代码内默认值；保持为无数据库依赖的纯定义。 */
export const SITE_COPY_KEYS = [
	'home.hero',
	'auth.login.intro',
	'auth.register.intro',
	'global.footer',
	'channel.weibo.hero',
	'channel.forum.hero',
	'channel.blog.hero'
] as const;

export type SiteCopyKey = (typeof SITE_COPY_KEYS)[number];

export const DEFAULT_SITE_COPY: Record<SiteCopyKey, string> = {
	'home.hero':
		'轻量、多元、自在\n\n# 在同一个社区，聊聊你关心的事。\n\n微博记录当下，论坛展开讨论，博客沉淀观点。发现值得停留的内容，也分享你的声音。',
	'auth.login.intro':
		'轻量、多元、自在\n\n# 把想说的，交给愿意听的人。\n\n在微博记录当下，在论坛展开讨论，在博客沉淀观点。',
	'auth.register.intro': `加入${SITE_TITLE}\n\n# 在这里，留下一点有用的声音。\n\n选择适合的表达方式，让一段想法获得持续的回应。`,
	'global.footer': `© ${new Date().getFullYear()} ${SITE_TITLE}`,
	'channel.weibo.hero': '此刻正在发生\n\n# 💬 微博\n\n分享你的想法，随时随地说点什么',
	'channel.forum.hero': '把问题聊透\n\n# 📋 论坛\n\n按版块分类讨论，找到你感兴趣的话题',
	'channel.blog.hero': '为想法留出篇幅\n\n# 📝 博客\n\n长文写作，深度思考'
};
