# 睦谈（MuTan）

轻量级多用户微博系统，支持微博、论坛、博客三种内容模式，可灵活组合或独立运行。

## 功能特性

- **三种内容模式**：微博（短内容流）、论坛（分类讨论）、博客（长文章），通过环境变量自由启用
- **细粒度可见度**：7 种帖子可见度（公开/登录可见/粉丝可见/关注可见/私密/密码保护/指定用户）
- **本地推荐**：基于热门分数、标签和分类提供"猜你喜欢"与相关推荐，无外部服务依赖
- **多主题系统**：4 套预置主题（亮色/暗色/护眼/高对比度）+ 5 种强调色
- **双认证方式**：JWT Cookie 认证（浏览器）+ API Token 认证（外部客户端）
- **管理后台**：用户/帖子/评论/标签/分类管理，操作日志审计
- **通知系统**：关注、评论、点赞、提及实时通知
- **Webhook**：支持自定义事件回调
- **SEO 优化**：Open Graph、JSON-LD 结构化数据、规范链接、站点地图

## 技术栈

- **框架**：Astro 7（服务端渲染）
- **前端**：Astro 组件 + React 19（Tiptap 富文本编辑器）
- **样式**：纯 CSS（CSS 变量设计令牌，无 UI 框架依赖）
- **数据库**：SQLite（libSQL）或 MySQL 8+（MariaDB adapter），按环境变量切换
- **ORM**：Prisma 7
- **认证**：JWT（jose）+ bcryptjs
- **部署**：Node.js standalone（默认），预留 Cloudflare 适配器

实际依赖版本以 `package.json` 和锁文件为准；当前项目直接依赖 Astro 7.2、React 19、Prisma 7。

## 快速开始

### 环境要求

- Node.js **22.12+**
- pnpm 10（仓库脚本、`run.cmd`、`reset.cmd` 均使用 pnpm）

### 安装

```bash
# 克隆仓库
git clone https://github.com/woodcoal/microblog.git
cd microblog

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少配置 JWT_SECRET

# 初始化数据库（默认 SQLite；修改 DATABASE_PROVIDER=mysql 后使用 MySQL）
pnpm run db:setup

# 启动开发服务器
pnpm run dev
```

访问 http://localhost:4321

### 生产部署

```bash
# 构建前会自动生成 Prisma Client 并应用已提交迁移
 pnpm run build

 # 方式一：直接启动
 pnpm run start

 # 方式二：PM2 进程管理
 pnpm run pm2
```

> 既有实例升级后首次重启前，先执行 `pnpm run db:prepare`，再使用 `pnpm run build` 和原有方式重启。该命令只会应用未执行的已提交迁移，不会重置数据库。

## 环境变量

复制 `.env.example` 为 `.env` 进行配置：

| 变量                                                                                  | 说明                                    | 示例/默认值                                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_PROVIDER`                                                                   | 数据库类型：`sqlite` 或 `mysql`         | `sqlite`                                                       |
| `DATABASE_URL`                                                                        | 当前数据库连接                          | `.env.example` 使用 `file:./prisma/dev.db`，实际以 `.env` 为准 |
| `TEST_DATABASE_URL`                                                                   | 验收测试专用连接，必须独立于开发/生产库 | `file:./prisma/test.db`                                        |
| `JWT_SECRET`                                                                          | JWT 签名密钥，生产环境务必更换          | 开发用占位值                                                   |
| `JWT_EXPIRES_DAYS`                                                                    | JWT 有效期（天）                        | `7`                                                            |
| `UPLOAD_DIR`                                                                          | 文件上传目录                            | `./uploads`                                                    |
| `SITE_URL`                                                                            | 站点 URL，用于生成绝对链接              | `http://localhost:4321`                                        |
| `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` / `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` | 验证链接有效期 / 重发冷却               | `30` / `60`                                                    |
| `MAIL_DELIVERY_MODE`                                                                  | 邮件投递模式；默认不投递                | `disabled`；生产可选 `webhook`                                 |
| `SITE_TITLE` / `SITE_DESCRIPTION`                                                     | 站点标题和描述                          | `睦谈` / 默认文案                                              |
| `SITE_MODES`                                                                          | 启用模式，逗号分隔                      | `weibo,forum,blog`                                             |
| `ALLOW_REGISTRATION`                                                                  | 是否允许注册                            | `true`                                                         |
| `API_V1_ENABLED` / `API_AGENT_ENABLED`                                                | 是否启用两组外部 API                    | `true` / `true`                                                |
| `API_CORS_ORIGINS`                                                                    | API CORS 来源白名单                     | `self`                                                         |
| `API_RATE_LIMIT_*`                                                                    | API 限流窗口与读/写/上传上限            | 见 `.env.example`                                              |
| `API_BODY_LIMIT_BYTES` / `API_UPLOAD_BODY_LIMIT_BYTES`                                | 普通请求体上限 / 全部上传入口唯一上限   | 见 `.env.example`                                              |
| `TRENDING_FORMULA`                                                                    | 热门分数公式 JSON                       | 见 `.env.example`                                              |
| `WEIBO_MEDIA_MAX_WIDTH_PX`                                                            | 微博媒体区域最大宽度                    | `640`                                                          |

`SITE_LOGO_URL`、`SITE_FAVICON_URL`、密码保护、置顶上限、保留用户名和模式别名等高级变量见 `.env.example`。不要提交 `.env` 或生产凭证。

帖子、论坛和博客的媒体与附件通过同源 `/api/upload` 上传。修改
`API_UPLOAD_BODY_LIMIT_BYTES` 后重启 Node 服务即可生效，无需重新构建。Node adapter、
反向代理和网关的请求体上限也必须不小于此值；实际可上传上限取三者中的最小值。
头像仍使用 Astro Action，保持原有语义。

邮箱验证邮件默认不投递，确保本地开发与测试不会误发真实邮件。生产环境可配置受信任的邮件 webhook；其 URL 和 Authorization 仅从运行期机密配置读取，原始验证令牌只进入一次性链接，不写入数据库、日志或仓库。

## Webhook 协议

Webhook 是用户主动配置的单向通知投递通道；每个事件向配置 URL 发出 `POST` JSON。它不接收或保存接收端响应 body，只有 `2xx` 表示本次投递成功；网络失败、超时和非 `2xx` 仅记录服务端日志，不影响关注、评论、点赞或发帖等主操作，当前不重试。

支持事件：`notification.follow`、`notification.comment`、`notification.like`、`notification.mention`。同一通知的 `id` 在每次投递中稳定，可作为接收端幂等键。

### 请求头与验签

| 请求头                | 含义                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `Content-Type`        | `application/json`                                                        |
| `X-Webhook-Id`        | 与 body 的 `id` 相同，用于幂等去重                                        |
| `X-Webhook-Timestamp` | 与 body 的 `occurredAt` 相同的 ISO 8601 时间                              |
| `X-Webhook-Signature` | `sha256=<hex>`，使用 Webhook Secret 对**原始 UTF-8 请求体**做 HMAC-SHA256 |

接收端必须先读取原始 body bytes，使用其保存的 64 位十六进制 Secret 计算 HMAC-SHA256，再以恒定时间比较 `X-Webhook-Signature`。不得先解析再序列化 JSON 后验签。建议同时拒绝超出自身允许时间窗的 `X-Webhook-Timestamp`，并按 `X-Webhook-Id` 去重。

### 事件结构

```json
{
	"schemaVersion": 1,
	"id": "通知 ID",
	"event": "notification.comment",
	"occurredAt": "2026-08-15T09:00:00.000Z",
	"data": {
		"notification": {
			"id": "通知 ID",
			"type": "comment",
			"createdAt": "2026-08-15T09:00:00.000Z"
		},
		"actor": {
			"id": "触发者 ID",
			"username": "alice",
			"displayName": "Alice",
			"avatarUrl": "/media/avatars/file-storage-id"
		},
		"post": {
			"id": "帖子 ID",
			"title": "帖子标题或 null",
			"url": "/alice/post-id"
		},
		"comment": {
			"id": "评论 ID",
			"content": "评论纯文本",
			"parentId": null,
			"url": "/alice/post-id#comment-comment-id"
		}
	}
}
```

- `actor` 始终存在。
- `post` 仅在事件关联且帖子未删除时存在；链接为相对站内路径。
- `comment` 仅在关联评论未删除、对应 `post` 可提供且接收者仍可查看该帖子时存在。它包含评论纯文本；帖子正文、邮箱、密码、允许名单和内部管理字段永不投递。
- 私密、密码保护或接收者不再有权查看的帖子不会提供 `post` 与 `comment`，避免 Webhook 在内容生命周期变化后重新泄露文本。
- `schemaVersion` 为兼容边界。新增可选字段不会改变 `1` 的既有字段含义。

## 未验证空账号清理

管理员在“管理后台 → 用户管理”可通过“清理未验证空账号”一键物理删除注册后未完成邮箱验证、从未登录或活跃、且没有任何内容或业务关系的普通账号。操作必须填写理由，并写入不可变管理员审计日志 `user.purge_unverified_empty`。

下列账号不会被清理：已完成邮箱验证的账号、管理员、已注销墓碑、登录或活跃过的账号，以及拥有帖子、评论、点赞、关注、收藏、通知、API Token、Webhook、上传预约、用户设置、推荐记录或任何审计关联的账号。清理会同时移除该账号的用户名占用记录和未消费验证令牌；删除不可恢复。

## 项目结构

src/
actions/ # Astro Actions（服务端 RPC）
pages/ # 文件路由、SSR 页面和 /api 路由
layouts/ # 基础、频道、账号和后台布局
components/ # Astro 组件与 React 岛
views/ # 帖子详情的微博/论坛/博客视图
services/ # 业务 Service 层
lib/ # 数据访问、认证、可见度、推荐等原子模块
types/ # API DTO 与共享类型
styles/ # CSS 设计令牌与组件样式
middleware.ts # 管理后台守卫、CSRF、API CORS/限流/请求体限制
prisma/
schema.sqlite.prisma # SQLite 数据库模型
schema.mysql.prisma # MySQL 数据库模型
migrations/ # 按 provider 分开的基线迁移
tests/ # node:test/tsx 测试与 Puppeteer 浏览器测试
skills/ # Agent API 使用说明

## 常用命令

pnpm run dev # 开发服务器（会先执行 db:prepare）
pnpm run build # 生产构建（会先执行 db:prepare）
pnpm run start # 启动 dist/server/entry.mjs
pnpm run preview # 预览构建产物
pnpm run typecheck # astro check
pnpm run lint # ESLint
pnpm run format:check # Prettier 检查
pnpm run format # Prettier 写入
pnpm run db:generate # 生成 Prisma Client
pnpm run db:migrate # 应用已提交迁移
pnpm run db:prepare # 生成 Client 并应用迁移
pnpm run db:migrate:dev # 创建/应用开发迁移
pnpm run db:status # 查看当前 provider 的迁移状态
pnpm run db:studio # Prisma Studio GUI
pnpm run db:seed # 写入种子数据
pnpm run db:setup # generate + migrate + seed
pnpm run pm2 # 用 ecosystem.config.js 启动 PM2

### 切换 SQLite / MySQL

`DATABASE_PROVIDER` 决定 Prisma schema、迁移目录和运行时 driver adapter，支持 `sqlite`（`file:` URL）与 `mysql`（`mysql://` URL）。每次修改该值后，使用同一组环境变量执行 `pnpm run db:prepare`，再启动应用；`dev`、`build`、`start` 与 `pm2` 会自动执行该预处理。`pnpm run db:setup` 会额外写入管理员种子数据。

SQLite 使用 `prisma/migrations/sqlite/0_init`，MySQL 使用 `prisma/migrations/mysql/0_init`。每个 provider 只保留这一个完整基线，适用于新建数据库；两个基线描述相同的数据模型，但不互相转换数据。从一种数据库迁移到另一种时请先备份并自行迁移数据，切勿对生产库使用 `prisma migrate reset`。

已使用旧版多文件迁移的数据库不能直接执行压缩后的迁移。请先备份数据库，并由维护者确认数据库结构与当前 schema 一致后，将 `_prisma_migrations` 重新基线化为对应的 `0_init`；未确认数据状态前不得重置迁移记录或使用 `prisma migrate reset`。

验收测试必须使用独立的 `TEST_DATABASE_URL`。SQLite 默认使用独立文件；MySQL 必须配置独立测试库，禁止指向生产库。

## 测试与 QA

测试使用 Node 内置 `node:test` + `tsx`，浏览器测试使用 Puppeteer；项目没有统一 `test` 脚本、CI 配置或覆盖率工具。

无需数据库即可直接运行的测试：

```bash
pnpm run test:site-config
pnpm run test:site-copy
pnpm run test:color-contrast
pnpm run test:admin-moderation-ui
pnpm run test:blog-assets-ui
```

推荐、频道和详情等未接入 package script 的测试，可按文件运行：

```bash
pnpm exec tsx --test tests/trending.test.ts
```

Service 测试会清空并写入 `DATABASE_URL` 指向的数据库，禁止直接对开发库或生产库运行。API 验收测试需要独立测试库、已应用迁移、空闲端口和运行中的 Astro 服务；浏览器测试需要 `MUTAN_E2E_BASE_URL` 与夹具数据。

`test:api-v1`、`test:api-agent` 与 `test:admin-auth` 会通过 `scripts/run-api-test.mjs` 创建独立 SQLite 验收库，或读取 MySQL 的 `TEST_DATABASE_URL`。MySQL 必须使用独立测试库，禁止指向开发或生产库。`test:mysql-qa` 要求 `DATABASE_PROVIDER=mysql`，并读取 `MYSQL_QA_ADMIN_URL`（兼容使用 `TEST_DATABASE_URL`）。默认模式创建带随机后缀的临时库，应用当前 MySQL 迁移，执行 20 路并发首注册验收，最后删除并复查临时库。若账号没有 `CREATE DATABASE` 权限，可显式设置 `MYSQL_QA_EXISTING_DATABASE=true MYSQL_QA_EXISTING_DATABASE_NAME=dev`；运行器会先确认连接确实选中 `dev`，再迁移、测试，最后删除该库全部业务表（含 `_prisma_migrations`）并复查为空。既有库模式仅允许专用 QA 库，禁止指向生产库，也不使用 `prisma migrate reset`。

页面、API 或数据库改动至少执行相关的 `typecheck`、格式检查和针对性测试；涉及真实 HTTP/认证/数据库链路时优先使用验收测试，而不是只 mock Service。

## 内容模式

通过 `SITE_MODES` 环境变量控制：

- **单模式**：只启用一种模式时，首页自动重定向到该模式首页，导航栏隐藏频道切换
- **多模式**：导航栏显示频道切换，三种模式帖子可在首页混排

每种模式有独立的布局、路由和交互方式：

| 模式 | 特点                | 路由     |
| ---- | ------------------- | -------- |
| 微博 | 短内容流，快速发布  | `/weibo` |
| 论坛 | 分类讨论，标题+内容 | `/forum` |
| 博客 | 长文章，富文本编辑  | `/blog`  |

## 许可证

MIT
