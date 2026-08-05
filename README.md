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

- **框架**：Astro 6（服务端渲染）
- **前端**：Astro 组件 + React 19（Tiptap 富文本编辑器）
- **样式**：纯 CSS（CSS 变量设计令牌，无 UI 框架依赖）
- **数据库**：MySQL 8+（MariaDB connector）
- **ORM**：Prisma 7
- **认证**：JWT（jose）+ bcryptjs
- **部署**：Node.js standalone（默认），预留 Cloudflare 适配器

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/woodcoal/microblog.git
cd microblog

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少配置 JWT_SECRET

# 初始化数据库（执行已提交的 MySQL 迁移）
npm run db:setup

# 启动开发服务器
npm run dev
```

访问 http://localhost:4321

### 生产部署

```bash
# 构建
npm run build

# 方式一：直接启动
npm run start

# 方式二：PM2 进程管理
npm run pm2
```

## 环境变量

复制 `.env.example` 为 `.env` 进行配置：

| 变量                 | 说明                                 | 默认值                                           |
| -------------------- | ------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL`       | 数据库连接                           | `mysql://user:password@127.0.0.1:3306/microblog` |
| `TEST_DATABASE_URL`  | API 验收测试专用连接（必须独立）     | —                                                |
| `JWT_SECRET`         | JWT 签名密钥（**生产环境务必更换**） | `mutan-dev-secret-change-in-production`          |
| `JWT_EXPIRES_DAYS`   | JWT 有效期（天）                     | `7`                                              |
| `UPLOAD_DIR`         | 文件上传目录                         | `./uploads`                                      |
| `SITE_URL`           | 站点 URL                             | `http://localhost:4321`                          |
| `SITE_TITLE`         | 站点标题                             | `睦谈`                                           |
| `SITE_DESCRIPTION`   | 站点描述                             | `世间纷纷扰扰，此处和睦相谈`                     |
| `SITE_MODES`         | 启用的模式（逗号分隔）               | `weibo,forum,blog`                               |
| `ALLOW_REGISTRATION` | 是否允许注册                         | `true`                                           |

完整变量列表见 `.env.example`。

## 项目结构

```
src/
  actions/          # Astro Actions（服务端 RPC）
  pages/            # 文件路由
  layouts/          # 布局组件
  components/       # UI 组件
  lib/              # 工具库
  services/         # 业务 Service 层
  styles/           # 样式文件
prisma/
  schema.prisma     # 数据库模型
```

## 常用命令

```bash
npm run dev              # 开发服务器
npm run build            # 构建
npm run start            # 生产启动
npm run db:generate      # 生成 Prisma Client
npm run db:migrate       # 数据库迁移
npm run db:studio        # Prisma Studio GUI
npm run db:setup         # 一键初始化数据库
npm run format           # 代码格式化
```

### MySQL 数据库

`DATABASE_URL` 需采用 `mysql://用户名:密码@主机:端口/数据库名` 格式。首次连接空数据库时，执行 `npm run db:setup` 创建表结构和管理员账号。

`test:api-v1` 与 `test:api-agent` 只读取 `TEST_DATABASE_URL`，并会向其中写入验收数据；请配置一个独立的测试库，禁止指向生产库。

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
