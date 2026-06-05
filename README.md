# 睦谈（MuTan）

> 世间纷纷扰扰，此处和睦相谈

轻量级多用户微博系统，基于 Astro 6 SSR + React Islands + Prisma 7 + SQLite 构建。

## 特性

- 📝 **微博发布** — 支持 Markdown、图片/附件上传、7 级可见度控制
- 💬 **互动系统** — 评论（二级回复）、点赞、关注
- 🏷️ **内容标签** — @提及、#话题标签、标签聚合页
- 📢 **通知系统** — 站内通知（关注/评论/点赞/提及）
- 🔗 **Webhook** — HMAC-SHA256 签名的事件推送
- 🔑 **API Token** — 第三方客户端安全访问
- 🎨 **多主题** — 亮色/暗色/护眼/高对比度，偏好持久化
- 🛡️ **管理后台** — 用户/帖子/评论/标签管理、操作审计
- 🔍 **全文搜索** — 用户搜索 + 微博搜索
- 📱 **SEO 友好** — SSR 渲染、Sitemap、robots.txt、Meta 标签

## 技术栈

| 组件     | 选型                     |
| -------- | ------------------------ |
| 前端框架 | Astro 6.x (SSR)          |
| 交互组件 | React 19 (Islands)       |
| 数据库   | SQLite (本地) / D1 (生产) |
| ORM      | Prisma 7.x               |
| 文件存储 | 本地 / Cloudflare R2     |
| API 文档 | Scalar                   |
| 部署     | Cloudflare Pages         |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm

### 安装

```bash
# 克隆项目
git clone https://git.hndl.vip/woodcoal/microblog.git
cd microblog

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写配置（至少修改 JWT_SECRET）

# 初始化数据库（生成 Client → 迁移 → 种子数据）
npm run db:setup

# 启动开发服务器
npm run dev
```

访问 http://localhost:4321

### 常用命令

| 命令                   | 说明                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | 启动开发服务器 (localhost:4321)       |
| `npm run build`        | 生产构建                              |
| `npm run preview`      | 预览构建产物                          |
| `npm run start`        | 运行构建后的服务                      |
| `npm run pm2`          | PM2 进程管理部署                      |
| `npm run format`       | Prettier 格式化                       |
| `npm run db:generate`  | 生成 Prisma Client                    |
| `npm run db:migrate`   | 执行数据库迁移                        |
| `npm run db:studio`    | 打开 Prisma Studio                    |
| `npm run db:seed`      | 填充种子数据                          |
| `npm run db:setup`     | 完整初始化：generate → migrate → seed |

## 环境变量

详见 [.env.example](.env.example)，关键配置：

| 变量             | 说明                   | 默认值                         |
| ---------------- | ---------------------- | ------------------------------ |
| `DATABASE_URL`   | 数据库连接             | `file:./prisma/dev.db`         |
| `JWT_SECRET`     | JWT 签名密钥           | ⚠️ 生产环境务必更换            |
| `SITE_TITLE`     | 站点标题               | `睦谈`                         |
| `SITE_URL`       | 站点 URL               | `http://localhost:4321`        |
| `UPLOAD_DIR`     | 上传目录               | `./uploads`                    |

## 项目结构

```
src/
├── pages/          # 页面（.astro）和 API 路由（.ts）
│   ├── api/        # REST API（auth/posts/comments/...）
│   ├── [username]/ # 用户主页、帖子详情、编辑、版本历史
│   ├── admin/      # 管理后台页面
│   └── tags/       # 标签聚合页
├── components/     # Astro + React Islands（交互组件）
├── layouts/        # 页面布局模板
├── lib/            # 核心逻辑（db/auth/visibility/shortid/...）
└── styles/         # 自定义 CSS
prisma/             # Schema + 迁移文件
generated/prisma/   # Prisma Client 输出（gitignored）
docs/               # 规格文档、计划、技术决策
scripts/            # 自动化验证脚本
```

## API 文档

启动开发服务器后访问 `/api/docs` 查看完整的 API 文档（Scalar）。

### 认证方式

三种认证方式按优先级：`Authorization: Bearer mt_xxx`（API Token）→ `Authorization: Bearer xxx`（JWT）→ cookie `token`（JWT）。

### 响应格式

```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "error": { "message": "...", "status": 400 } }
```

## 部署

### Cloudflare Pages

1. 修改 `astro.config.mjs`，切换 `@astrojs/cloudflare` 适配器
2. 配置 Cloudflare D1 数据库和 R2 存储桶
3. 设置环境变量
4. 构建命令：`npm run build`，输出目录：`dist/`

### 自托管（PM2）

```bash
npm run build
npm run pm2
```

## 许可证

[MIT](LICENSE) © 2026 木炭
