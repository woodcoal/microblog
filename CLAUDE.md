# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

睦谈（MuTan）是一个基于 Astro 6 + React + Prisma 的轻量级多用户微博系统。支持三种内容模式：微博（weibo）、论坛（forum）、博客（blog），可通过环境变量灵活启用/禁用。

## 常用命令

```bash
# 开发服务器
npm run dev

# 构建
npm run build

# 生产启动（使用 dotenv 加载 .env）
npm run start

# PM2 生产部署
npm run pm2

# 数据库操作
npm run db:generate    # Prisma client 生成
npm run db:migrate     # 数据库迁移
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # 种子数据
npm run db:setup       # 一键初始化（generate + migrate + seed）

# 代码格式化
npm run format         # Prettier 格式化
npm run format:check   # 格式化检查
```

## 技术栈

- **框架**: Astro 6（output: 'server'，Node.js standalone 模式）
- **前端**: Astro 组件 + React 19（仅用于 Tiptap 编辑器）
- **数据库**: SQLite（@libsql/client + @prisma/adapter-libsql，纯 JS 实现，无需 C++ 编译）
- **ORM**: Prisma 7，client 输出到 `generated/prisma`
- **认证**: JWT（jose）+ bcryptjs，双认证方式（JWT cookie + API Token）
- **推荐**: DaLi.Lens 推荐中间件（可选，未配置 LENS_ENDPOINT 则停用）
- **部署**: Node.js standalone（默认），预留 Cloudflare 适配器切换

## 项目结构

```
src/
  actions/          # Astro Actions（服务端 RPC）
    index.ts        # 统一导出所有 actions
    content.ts      # 帖子/评论 CRUD
    auth.ts         # 登录/注册/登出
    social.ts       # 点赞/关注/收藏
    settings.ts     # 用户设置/资料/密码/头像
    admin.ts        # 管理后台批量操作
    ...
  pages/            # Astro 文件路由
    index.astro     # 首页（推荐/热门）
    [username]/     # 用户主页
    [username]/[postId]/   # 帖子详情
    weibo/          # 微博频道
    forum/          # 论坛频道
    blog/           # 博客频道
    admin/          # 管理后台
    api/            # API 路由（Agent API、文档等）
  layouts/          # 布局组件
    Base.astro      # 基础布局（导航、主题、弹窗）
    HomeLayout.astro
    WeiboLayout.astro
    ForumLayout.astro
    BlogLayout.astro
    Admin.astro
  components/       # UI 组件
    PostCard.astro
    CommentList.astro / CommentForm.astro / CommentItem.astro
    ComposeModal.astro
    PostEditor.astro / BlogEditor.tsx
    ThemeSwitcher.astro
    ...
  lib/              # 工具库
    db.ts           # Prisma Client 单例
    auth.ts         # JWT/密码/API Token 认证
    config.ts       # 环境变量与配置常量
    visibility.ts   # 7 种帖子可见度控制
    theme.ts        # 主题/强调色管理
    errors.ts       # ServiceError 类
    queries.ts      # 通用 Prisma include/select
    lens.ts         # DaLi.Lens 推荐中间件集成
    trending.ts     # 热门分数计算
    activity.ts     # 操作日志
    notification.ts # 通知系统
    parser.ts       # @提及 / #标签 解析
    markdown.ts     # Markdown 渲染
    upload.ts       # 文件上传/MD5 去重
    webhook.ts      # Webhook 触发
    token.ts        # API Token 哈希/验证
    shortid.ts      # 8 位短链 ID 生成
  services/         # 业务 Service 层（纯函数，不依赖 Astro 上下文）
    content.service.ts
    auth.service.ts
    social.service.ts
    ...
  styles/
    tokens.css      # CSS 变量/设计令牌
    base.css        # 全局基础样式
    components.css  # 组件样式
    admin.css       # 管理后台样式
prisma/
  schema.prisma     # 数据库模型定义
```

## 架构要点

### 认证系统

双认证方式：

1. **JWT Cookie 认证**：SSR 页面使用，`token` cookie（httpOnly, sameSite: lax）
2. **API Token 认证**：外部客户端使用，`Authorization: Bearer mt_xxx` 格式

`src/lib/auth.ts` 的 `getUserFromRequest` 按优先级处理两种认证，JWT 认证会检查用户 `isDisabled` 状态。

### Astro Actions 模式

所有服务端 mutation 通过 Astro Actions 暴露（`src/actions/`）。

**关键约定**：Astro 6 Actions 客户端返回 `SafeResult`（`{ data, error }`），**不抛异常**。客户端调用必须检查 `result.error`：

```ts
const result = await actions.createPost({ content: '...' });
if (result.error) {
	// 错误处理：result.error.message
	return;
}
// 成功数据在 result.data 中
```

### 可见度系统

7 种帖子可见度：`public` / `logged_in` / `followers` / `following` / `private` / `password` / `users`。

- `src/lib/visibility.ts` 提供 `checkPostVisibility`（单条检查）和 `getVisibilityFilter`（Prisma where 条件生成）
- 列表查询时 `password`/`users` 类型的帖子会出现在列表中但内容受限（前端显示提示），避免用户完全看不到存在受限帖子

### 主题系统

4 套预置主题 + 5 种强调色，存储在 `UserSettings` 表。`Base.astro` 在 `<head>` 中内联脚本从 `localStorage` 读取主题，防止 FOUC。主题切换通过 Astro Action `updateTheme` 同时更新数据库和 localStorage。

### 多模式支持

通过 `SITE_MODES` 环境变量（逗号分隔，如 `weibo,forum,blog`）控制启用的内容模式：

- 单模式时首页自动重定向到该模式首页
- 多模式时导航栏显示频道切换
- 每种模式有独立的布局（WeiboLayout / ForumLayout / BlogLayout）和路由

### Service 层

`src/services/` 存放纯业务逻辑函数，不依赖 Astro 上下文，接收纯参数返回纯数据。Actions 层负责鉴权 + 输入校验，调用 Service 层执行业务。Service 层抛出 `ServiceError`，Actions 层转换为 `ActionError`。

### 数据库

Prisma 7 使用 driver adapter 模式，`@prisma/adapter-libsql` 连接 SQLite。`src/lib/db.ts` 提供单例 PrismaClient，开发环境通过 `globalThis` 避免热重载创建过多连接。

生成路径：`generated/prisma/client`（由 `prisma/schema.prisma` 的 `output` 指定）。

## 环境变量

复制 `.env.example` 为 `.env` 进行配置。关键变量：

- `DATABASE_URL` — 数据库连接（默认 `file:./prisma/dev.db`）
- `JWT_SECRET` — JWT 签名密钥
- `SITE_MODES` — 启用的模式（默认 `weibo`）
- `SITE_MODE_WEIBO` / `SITE_MODE_FORUM` / `SITE_MODE_BLOG` — 模式显示别名
- `LENS_ENDPOINT` / `LENS_API_KEY` — DaLi.Lens 推荐中间件（未设置则停用）
- `ALLOW_REGISTRATION` — 是否允许注册（默认 `true`）
- `EXTRA_RESERVED_USERNAMES` — 额外保留用户名（逗号分隔）

## 注意事项

- **import.meta.env vs process.env**：Astro/Vite 通过 `import.meta.env` 加载 `.env` 变量，`process.env` 仅含系统级变量。`src/lib/config.ts` 的 `getEnv()` 优先读取 `import.meta.env`，回退 `process.env`。
- **checkOrigin: false**：`astro.config.mjs` 中已关闭 Origin 校验，避免代理/内网部署时的 CSRF 问题。
- **路径别名**：`@/` 映射到 `src/`（Vite alias 配置）。
- **文件上传**：本地存储在 `UPLOAD_DIR`（默认 `./uploads`），通过 `FileStorage` 表做 MD5 去重和引用计数。
- **短链 ID**：帖子 ID 使用 8 位无规律短链（非自增），由 `src/lib/shortid.ts` 生成。
