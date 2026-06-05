# MuTan（睦谈）— Agent 指南

轻量级多用户微博系统。Astro 6 SSR + React Islands + Prisma 7 + SQLite。

## 快速命令

| 命令                   | 作用                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | 启动开发服务器 (localhost:4321)       |
| `npm run build`        | 生产构建                              |
| `npm run preview`      | 预览构建产物                          |
| `npm run format`       | Prettier 格式化全部文件               |
| `npm run format:check` | 检查格式                              |
| `npm run db:generate`  | 生成 Prisma Client                    |
| `npm run db:migrate`   | 执行新迁移                            |
| `npm run db:studio`    | 打开 Prisma Studio                    |
| `npm run db:seed`      | 填充种子数据                          |
| `npm run db:setup`     | 完整初始化：generate → migrate → seed |

无 lint 或 typecheck 命令（`@astrojs/check` 在依赖中但未配置脚本）。

## 项目架构

```
src/
├── pages/          # 页面（.astro）和 API 路由（.ts）
│   ├── api/        # REST API（auth/posts/comments/...）
│   ├── [username]/ # 用户主页、帖子详情、编辑、版本历史
│   ├── admin/      # 管理后台页面
│   └── tags/       # 标签聚合页
├── components/     # Astro + React Islands（FollowButton, LikeButton 等交互组件）
├── layouts/        # Base.astro, Admin.astro
├── lib/            # 核心逻辑（db/auth/visibility/shortid/config/...）
└── styles/         # components.css（自定义 CSS）
prisma/             # schema + migrations
scripts/            # Puppeteer 浏览器自动化验证脚本
generated/prisma/   # Prisma Client 输出（gitignored）
docs/               # SPEC、PLAN、里程碑文档、技术决策
```

## 关键架构事实

### 认证

三种认证方式按优先级：`Authorization: Bearer mt_xxx`（API Token）→ `Authorization: Bearer xxx`（JWT）→ cookie `token`（JWT）。被禁用用户的所有请求均拒绝（fail-closed）。

### 数据库

- Prisma 7 + libsql adapter（纯 JS，无 C++ 编译需求）
- SQLite 本地开发 / Cloudflare D1 生产
- `prisma.config.ts` 管理连接 URL，`src/lib/db.ts` 导出单例
- 迁移在 `prisma/migrations/`，客户端输出在 `generated/prisma/`

### 帖子 ID

8 位无规律短链（应用层生成，非 DB auto-increment）。排除易混淆字符（0/O/1/l/I）。实现：`src/lib/shortid.ts`。

### 可见度系统

7 级可见度（public/logged_in/followers/following/private/password/users），列表查询用 Prisma OR 条件 + 逐条后置验证。核心逻辑：`src/lib/visibility.ts`。

### API 约定

统一响应：`{ success: true, data }` 或 `{ success: false, error: { message, status } }`。PUT 路由通常用于切换操作（点赞/关注/锁定）。

### 前端

- React Islands（交互组件如 LikeButton、PostEditor）
- 无 UnoCSS（SPEC 提到但未采用），使用 `src/styles/components.css`

## Astro 模板陷阱

**禁止**在 `{}` 中直接使用比较运算符（`<` `<=` `>` `>=`），Astro 编译器会误解析。先在 frontmatter 中提取为变量。

## 运行测试

自动化验证脚本在 `scripts/` 下，使用 Puppeteer：

```
npm run dev          # 先启动开发服务器（另一个终端）
node scripts/m2-test.mjs  # 然后执行测试
```

测试前需先 `npm run db:setup` 初始化数据库和种子数据。

## 代码风格

- 缩进：tab（1 tab = 4 空格）
- 引号：单引号
- 尾逗号：无
- 所有代码必须有详细中文注释，每个函数必须有完整说明
- 环境变量通过 `import.meta.env` 读取（Astro/Vite），非 Astro 上下文回退 `process.env`
- `.env` 示例见 `.env.example`

## 部署

Cloudflare Pages（D1 + R2）。`wrangler.toml` 已配置。构建命令 `astro build` 输出到 `dist/`。开发时使用 `@astrojs/node`（standalone 模式），部署时切换 `@astrojs/cloudflare`。

## 已知的重要细节

- 内置保留用户名列表在 `src/lib/config.ts`，可通过 `EXTRA_RESERVED_USERNAMES` 追加
- 操作日志异步非阻塞写入，永不冒泡异常
- Webhook 使用 HMAC-SHA256 签名
- Prisma 7 的 schema 和 datasource 在 `prisma.config.ts` 而非 `schema.prisma` 中配置
- 站点所有配置通过 `.env` 管理，不存储在数据库中
- 自托管 GitLab：`https://git.hndl.vip/woodcoal/microblog`
