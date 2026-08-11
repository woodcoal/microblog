# Repository Guidelines

## 项目概览

睦谈（MuTan）是一个基于 Astro SSR 的多用户内容平台，支持微博、论坛、博客三种内容模式，可单独启用或组合运行。核心能力包括帖子与评论、关注/点赞/收藏、推荐、通知、Webhook、管理后台、媒体上传，以及两组外部 API：`/api/v1` JSON API 和 `/api/agent` Agent 纯文本 API。

## 架构与数据流

应用使用 Astro 7 的服务端渲染和 Node standalone adapter。

```text
浏览器或 HTTP 客户端
  -> src/middleware.ts
  -> src/pages/（SSR 页面或 API 路由）/ src/actions/（Astro Actions）
  -> src/services/（业务编排）
  -> src/lib/（数据访问、认证、规则和工具）
  -> Prisma 7
  -> libSQL/SQLite 或 MariaDB/MySQL adapter
```

- `src/middleware.ts` 统一处理管理后台权限、API 启用开关、CORS、按 IP+路由限流、请求体大小和浏览器 unsafe 请求的 CSRF 校验。
- 浏览器认证优先使用 Cookie；外部 API 使用 Bearer JWT 或 `mt_` API Token。Bearer API 请求不读取 Cookie，以避免 CSRF 混用。
- 页面通常在 frontmatter 获取当前用户、可见度过滤和 Service 数据，再交给 Astro 组件渲染。
- `src/actions/` 将领域操作导出为 Astro Actions；`src/pages/api/` 负责 `/api/v1`、`/api/agent`、上传和 API 文档路由。
- Service 层负责业务事务和错误编排；`src/lib/` 提供 Prisma 单例、认证、可见度、推荐、上传、媒体、通知和 API 安全等底层模块。
- 帖子详情由 `src/pages/[username]/[postId]/index.astro` 统一加载，再按 `post.mode` 分发到 `src/views/post-detail/` 的微博、论坛或博客视图。
- 数据库由 `DATABASE_PROVIDER` 选择 `prisma/schema.sqlite.prisma` 或 `prisma/schema.mysql.prisma`，同时选择对应迁移目录和 driver adapter。

## 关键目录

- `src/pages/`：文件路由、SSR 页面和 API 路由；频道入口为 `weibo.astro`、`forum/index.astro`、`blog/index.astro`。
- `src/actions/`：认证、内容、社交、媒体、通知、推荐、设置、Webhook、管理等 Astro Actions。
- `src/services/`：业务 Service 层，例如 `content.service.ts`、`recommend.service.ts`、`api-v1.service.ts`、`admin.service.ts`。
- `src/lib/`：数据库、认证、可见度、推荐、搜索、上传、CSRF、API 安全和短 ID 等模块。
- `src/components/`：Astro UI 组件和 React 岛；Tiptap 相关编辑器使用 `.tsx`。
- `src/layouts/`：`Base.astro`、频道布局、账号布局和管理后台布局。
- `src/views/post-detail/`：三种内容模式的帖子详情视图。
- `src/types/`：API DTO 和共享类型。
- `src/styles/`：CSS 变量令牌、基础样式、组件样式和后台样式。
- `prisma/`：双数据库 schema、迁移和 `seed.ts`。
- `tests/`：Node `node:test`/`tsx` 测试、Service/验收测试和 Puppeteer 浏览器测试。
- `skills/`：面向 Agent 的 `/api/agent` 使用说明。

## 开发命令

项目使用 pnpm；执行 `dev`、`build`、`start`、`pm2` 前会自动运行 `db:prepare`。

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run start
pnpm run preview
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run format
```

数据库命令：

```bash
pnpm run db:generate      # 生成 Prisma Client
pnpm run db:prepare       # generate + migrate deploy
pnpm run db:migrate       # 应用已提交迁移
pnpm run db:migrate:dev   # 创建/应用开发迁移
pnpm run db:status
pnpm run db:studio
pnpm run db:seed
pnpm run db:setup         # generate + migrate + seed
pnpm run pm2
```

切换 SQLite/MySQL 前修改 `DATABASE_PROVIDER` 和对应的 `DATABASE_URL`，随后执行 `pnpm run db:prepare`。两个 provider 使用各自的 `0_init` 基线，不是相互转换迁移；生产库切勿执行 `prisma migrate reset`。提交迁移前先确认当前 provider 和数据库备份策略。

## 代码约定与常见模式

- TypeScript 使用 Astro strict 配置；源码导入优先使用 `@/*`，该别名指向 `src/*`。
- 格式化由 Prettier 统一：单引号、分号、Tab 缩进、100 列、无尾随逗号、LF 换行；修改代码后运行 `pnpm run format:check`。
- lint 使用 ESLint、`typescript-eslint` 和 `eslint-plugin-astro`；忽略 `dist/`、`generated/`、`node_modules/`、`.astro/`。
- 业务函数放在 Service 层，使用明确的输入/结果类型和 `ServiceError`/错误码；API 层将错误映射为 HTTP 响应，不在路由中复制业务规则。
- 列表查询通常组合可见度过滤、`POST_CARD_INCLUDE` 和逐条受限检查；不要绕过 `src/lib/visibility.ts` 直接暴露帖子。
- 发帖及媒体关联使用事务；上传采用“预留 -> 消费”的两阶段流程。修改媒体或帖子状态时保留已有软删除、锁定、置顶和审计字段语义。
- 通知、审计和非关键的 `lastUsedAt` 更新可作为异步副作用执行；不要让失败的非关键副作用覆盖主请求结果。
- 所有浏览器端状态变更请求都要保留 CSRF 约束；外部 Bearer API 走 middleware 的 CORS、限流和请求体限制。
- Astro 页面 frontmatter 先计算布尔条件和数据，模板中避免复杂比较；新增模式逻辑需同时考虑 `SITE_MODES`、单模式首页重定向和模式标签。
- 数据库访问复用 `src/lib/db.ts` 的 Prisma 单例；不要在请求路径中随意创建新客户端。

## 重要文件

- `package.json`：依赖版本、开发/构建/数据库/测试脚本；它是命令事实源。
- `astro.config.mjs`：SSR、Node standalone、React 集成、`@` 别名、Origin 校验和开发服务器配置。
- `prisma.config.ts`：按 `DATABASE_PROVIDER` 选择 schema 和迁移目录。
- `src/middleware.ts`：全局权限和请求安全边界。
- `src/lib/config.ts`：环境变量解析、模式、API 安全和业务限制。
- `src/lib/db.ts`、`src/lib/database-adapter.ts`：Prisma 7 单例和 SQLite/MySQL adapter。
- `src/actions/index.ts`：Astro Actions 的统一导出入口。
- `src/pages/index.astro`：推荐/发现首页；单模式时负责重定向。
- `src/pages/[username]/[postId]/index.astro`：统一帖子详情入口。
- `ecosystem.config.js`：PM2 生产进程配置，入口为 `dist/server/entry.mjs`，进程名为 `mutan`。
- `.env.example`：环境变量模板；不要提交 `.env` 或真实凭证。
- `skills/SKILL.md`：Agent API 认证、端点、响应格式和参数约定。

## 运行时与工具偏好

- Node.js 要求至少 `22.12.0`；Astro 7.2 和 Prisma 7 的当前依赖链不应按 Node 18 运行。
- 包管理器使用 pnpm（当前环境验证版本为 11.21.0）；不要在仓库中切换到 npm/yarn 工作流或生成新的锁文件。
- 生产构建输出为 `dist/server/entry.mjs`，直接启动使用 `node -r dotenv/config`，PM2 使用 `ecosystem.config.js`。
- 默认数据库是 SQLite/libSQL，也支持 MySQL 8+ 的 MariaDB adapter；连接字符串必须分别以 `file:` 或 `mysql://` 开头。
- `DATABASE_URL` 的默认值以当前 `.env`/`.env.example` 为准，不要把本地数据库文件路径硬编码进业务逻辑；生产环境显式设置所有关键变量。
- 关键安全变量包括 `JWT_SECRET`、`API_CORS_ORIGINS`、API 限流/请求体上限和 `UPLOAD_DIR`；生产环境必须更换开发 JWT 密钥。

## 测试与 QA

测试框架是 Node 内置 `node:test` + `tsx`，浏览器测试使用 Puppeteer。当前没有统一 `test` 脚本、CI 配置或覆盖率工具。

无需数据库即可直接运行的测试：

```bash
pnpm run test:site-config
pnpm run test:site-copy
pnpm run test:color-contrast
pnpm run test:admin-moderation-ui
pnpm run test:blog-assets-ui
```

未接入 package script 的单文件测试可用以下形式运行：

```bash
pnpm exec tsx --test tests/trending.test.ts
```

- Service 测试会清空并写入 `DATABASE_URL` 指向的数据库，必须使用专用测试库，禁止对开发库或生产库运行。
- API 验收测试需要独立 `TEST_DATABASE_URL`、已应用迁移、空闲端口和 Astro 服务；真实 API/认证/数据库改动优先使用验收测试验证。
- 浏览器测试需要 `MUTAN_E2E_BASE_URL` 指向运行中的站点，并准备 `tests/fixtures/` 中要求的 QA 数据。
- `package.json` 中部分 `test:*` 脚本引用根目录 `scripts/run-*.mjs`，但当前仓库没有对应 `scripts/` 目录；这些命令不可视为已验证通过。先检查 runner 是否已恢复，再执行。
- 改动页面、API 或数据库时，至少运行相关类型检查、格式检查和针对性测试；不要只依赖 mock 结果证明真实链路可用。
