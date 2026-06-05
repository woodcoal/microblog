# MuTan（睦谈）— 轻量级微博系统

> 文档版本：v2.1
> 创建时间：2026-06-03
> 更新时间：2026-06-04
> 负责人：木炭

---

## 一、项目概述

### 1.1 项目背景

头头（木炭）计划开发一个轻量级微博网站系统，目标：

- 支持 SEO，利于搜索引擎收录
- 可通过 API 供客户端或其他工具调用
- 起步轻资产、快启动，逐步扩展

### 1.2 项目定位

| 维度     | 描述                                    |
| -------- | --------------------------------------- |
| 产品名称 | 睦谈（MuTan）                           |
| 产品类型 | 微博/动态内容社区                       |
| 产品理念 | 世间纷纷扰扰，此处和睦相谈              |
| 核心用户 | 普通互联网用户                          |
| 部署目标 | 初期本地测试，生产部署 Cloudflare Pages |
| 成本目标 | 起步零成本，逐步扩展                    |

### 1.3 技术栈

| 组件     | 选型             | 说明                                         |
| -------- | ---------------- | -------------------------------------------- |
| 前端框架 | Astro 6.x        | SSR 支持好，SEO 友好，支持 React Islands     |
| CSS      | UnoCSS           | 原子化 CSS，按需生成                         |
| 数据库   | SQLite (D1)      | 本地开发 / Cloudflare D1，支持后续迁移 MySQL |
| ORM      | Prisma 7.x       | 统一数据库访问层                             |
| 文件存储 | 本地 + R2        | 本地开发用本地文件，生产用 Cloudflare R2     |
| 搜索     | LIKE 查询        | 起步够用，后续升级 Typesense                 |
| API 文档 | Scalar (Swagger) | 美观的 API 文档页面                          |
| 邮件     | SMTP             | 用户注册/通知邮件                            |
| 部署     | Cloudflare Pages | 初期本地，生产环境                           |

---

## 二、路由结构

### 2.1 页面路由（SSR）

| 路径                                 | 说明                        | 组件                                  |
| ------------------------------------ | --------------------------- | ------------------------------------- |
| `/`                                  | 首页（热门时间线）          | `index.astro`                         |
| `/latest`                            | 最新时间线（按时间倒序）    | `latest.astro`                        |
| `/login`                             | 登录页                      | `login.astro`                         |
| `/register`                          | 注册页（关闭时显示提示）    | `register.astro`                      |
| `/search`                            | 全站搜索（分区：用户/微博） | `search.astro`                        |
| `/settings`                          | 个人设置                    | `settings/index.astro`                |
| `/following`                         | 关注时间线（仅登录用户）    | `following.astro`                     |
| `/followers`                         | 粉丝列表（仅登录用户）      | `followers.astro`                     |
| `/notifications`                     | 通知列表                    | `notifications.astro`                 |
| `/admin`                             | 管理后台仪表盘（需 admin）  | `admin/index.astro`                   |
| `/admin/users`                       | 用户管理                    | `admin/users.astro`                   |
| `/admin/posts`                       | 帖子管理                    | `admin/posts.astro`                   |
| `/admin/comments`                    | 评论管理                    | `admin/comments.astro`                |
| `/admin/tags`                        | 标签管理                    | `admin/tags.astro`                    |
| **`/[username]`**                    | **用户主页（含帖子搜索）**  | `[username]/index.astro`              |
| **`/[username]/[postId]`**           | **帖子详情**                | `[username]/[postId].astro`           |
| **`/[username]/[postId]/edit`**      | **编辑帖子**                | `[username]/[postId]/edit.astro`      |
| **`/[username]/[postId]/revisions`** | **版本历史**                | `[username]/[postId]/revisions.astro` |
| **`/tags/[tag]`**                    | **标签聚合页**              | `tags/[tag].astro`                    |
| `/api/docs`                          | API 文档（Scalar）          | —                                     |

**设计原则：**

- 帖子必须带用户名（`/alice/abc123`），禁止裸 `/abc123`
- 理由：便于权限判断、统一归属感、SEO 友好（username 有品牌价值）
- 用户主页、帖子详情、编辑、历史版本在同一路径树下
- `/following` 和 `/followers` 仅当前登录用户可用
- 用户主页支持搜索该用户的帖子
- `/search` 搜索页分为用户搜索和微博搜索两个分区

### 2.2 API 路由

#### 认证

| 方法 | 路径               | 说明 |
| ---- | ------------------ | ---- |
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login    | 登录 |
| POST | /api/auth/logout   | 登出 |

#### 帖子

| 方法   | 路径                | 说明                  |
| ------ | ------------------- | --------------------- |
| GET    | /api/posts          | 热门时间线帖子列表    |
| GET    | /api/posts/latest   | 最新时间线帖子列表    |
| POST   | /api/posts          | 发帖                  |
| GET    | /api/posts/:id      | 获取单个帖子          |
| PUT    | /api/posts/:id      | 编辑帖子              |
| DELETE | /api/posts/:id      | 删除帖子（软删除）    |
| PUT    | /api/posts/:id/like | 切换点赞（点赞/取消） |
| PUT    | /api/posts/:id/pin  | 切换置顶（置顶/取消） |
| PUT    | /api/posts/:id/lock | 切换锁定（锁定/解锁） |

#### 评论

| 方法   | 路径                    | 说明         |
| ------ | ----------------------- | ------------ |
| GET    | /api/posts/:id/comments | 获取评论列表 |
| POST   | /api/posts/:id/comments | 发表评论     |
| DELETE | /api/comments/:id       | 删除评论     |
| PUT    | /api/comments/:id/like  | 切换点赞评论 |

#### 用户

| 方法 | 路径                        | 说明                     |
| ---- | --------------------------- | ------------------------ |
| GET  | /api/users/:username        | 用户信息                 |
| PUT  | /api/users/:username/follow | 切换关注（关注/取关）    |
| GET  | /api/users/:username/posts  | 用户帖子列表（支持搜索） |

#### 时间线

| 方法 | 路径                    | 说明           |
| ---- | ----------------------- | -------------- |
| GET  | /api/timeline/following | 关注用户时间线 |

#### 搜索

| 方法 | 路径              | 说明     |
| ---- | ----------------- | -------- |
| GET  | /api/search/posts | 搜索帖子 |
| GET  | /api/search/users | 搜索用户 |

#### 标签

| 方法 | 路径                  | 说明         |
| ---- | --------------------- | ------------ |
| GET  | /api/tags/:name/posts | 标签聚合帖子 |

#### 上传

| 方法 | 路径        | 说明           |
| ---- | ----------- | -------------- |
| POST | /api/upload | 上传图片或附件 |

#### 通知

| 方法 | 路径                            | 说明     |
| ---- | ------------------------------- | -------- |
| GET  | /api/notifications              | 通知列表 |
| PUT  | /api/notifications/read         | 标记已读 |
| GET  | /api/notifications/unread-count | 未读数量 |

#### 个人设置

| 方法 | 路径                   | 说明         |
| ---- | ---------------------- | ------------ |
| GET  | /api/settings          | 获取设置     |
| PUT  | /api/settings          | 更新设置     |
| PUT  | /api/settings/profile  | 更新个人资料 |
| PUT  | /api/settings/password | 修改密码     |

#### API Token

| 方法   | 路径            | 说明       |
| ------ | --------------- | ---------- |
| GET    | /api/tokens     | Token 列表 |
| POST   | /api/tokens     | 创建 Token |
| DELETE | /api/tokens/:id | 撤销 Token |

#### Webhook

| 方法   | 路径              | 说明         |
| ------ | ----------------- | ------------ |
| GET    | /api/webhooks     | Webhook 列表 |
| POST   | /api/webhooks     | 创建 Webhook |
| PUT    | /api/webhooks/:id | 更新 Webhook |
| DELETE | /api/webhooks/:id | 删除 Webhook |

#### 管理后台

| 方法   | 路径                            | 说明                     |
| ------ | ------------------------------- | ------------------------ |
| GET    | /api/admin/users                | 用户列表                 |
| PUT    | /api/admin/users/:id/disable    | 禁用用户                 |
| PUT    | /api/admin/users/:id/enable     | 启用用户                 |
| GET    | /api/admin/posts                | 全部帖子列表             |
| DELETE | /api/admin/posts/:id            | 删除帖子（需理由）       |
| PUT    | /api/admin/posts/:id/restore    | 恢复已删除帖子（需理由） |
| PUT    | /api/admin/posts/:id/global-pin | 全局置顶/取消            |
| PUT    | /api/admin/posts/:id/lock       | 锁定帖子（需理由）       |
| PUT    | /api/admin/posts/:id/unlock     | 解锁帖子                 |
| GET    | /api/admin/comments             | 评论列表                 |
| DELETE | /api/admin/comments/:id         | 删除评论                 |
| GET    | /api/admin/tags                 | 标签列表                 |
| PUT    | /api/admin/tags/:id/hide        | 隐藏标签                 |
| PUT    | /api/admin/tags/:id/show        | 显示标签                 |
| GET    | /api/admin/activity-logs        | 操作记录列表             |

---

## 三、功能规格

### 3.1 用户体系

#### 3.1.1 用户注册

| 字段                  | 类型   | 说明              |
| --------------------- | ------ | ----------------- |
| 用户名 (username)     | string | 唯一，用于 @提及  |
| 显示名 (display_name) | string | 页面展示名称      |
| 邮箱 (email)          | string | 唯一，登录凭证    |
| 密码 (password)       | string | bcrypt 加密存储   |
| 头像 (avatar_url)     | string | 头像 URL          |
| 个人简介 (bio)        | string | 可选，限制 160 字 |

**功能要求：**

- 邮箱 + 密码注册（前期无需邮箱验证，后续增加验证码）
- 用户名格式：字母数字下划线，3-20 字符
- 用户名不能为系统保留词（内置保留词如 login、register、admin 等，可通过 `EXTRA_RESERVED_USERNAMES` 环境变量追加更多）
- 密码：至少 8 字符
- 注册后自动发送欢迎邮件
- 当环境变量 `ALLOW_REGISTRATION=false` 时，注册页显示"注册已关闭"提示

#### 3.1.2 用户登录

- 邮箱 + 密码登录
- 登录后 JWT Token 认证（HS256，7天有效，自动续期）
- 认证头：`Authorization: Bearer <token>`

#### 3.1.3 用户角色

| 角色  | 说明                   |
| ----- | ---------------------- |
| user  | 普通用户，默认角色     |
| admin | 管理员，可访问管理后台 |

> 角色存储在 User 表的 `role` 字段，预留扩展（如 moderator）。

#### 3.1.4 用户主页

- 展示用户资料（头像、昵称、简介、粉丝数、关注数、发帖数）
- 用户发布的微博列表（分页，置顶帖优先）
- **支持搜索该用户的帖子**（按关键词过滤）
- 当前登录用户可查看：关注/取关按钮
- 被禁用用户的帖子全部隐藏，评论显示管理员配置的提示词

#### 3.1.5 用户禁用

- 管理员可禁用/启用用户
- 禁用后：该用户所有帖子隐藏，评论显示"该用户已被禁用"（提示词可在管理后台配置）
- 禁用用户无法登录

### 3.2 微博功能

#### 3.2.1 发帖

| 字段                | 类型   | 说明                               |
| ------------------- | ------ | ---------------------------------- |
| 内容 (content)      | string | 最多 1000 字符（含 Markdown 源码） |
| 图片 (media)        | array  | 最多 9 张图片                      |
| 附件 (attachments)  | array  | 附件文件列表                       |
| 可见度 (visibility) | enum   | 见下方可见度规则                   |

**功能要求：**

- 内容支持简单 Markdown 标签（见下方）
- 内容支持 @提及用户（@username 自动解析）
- 内容支持 #话题标签（#tag# 自动解析）
- 发布时间自动记录
- 支持可见度控制（见下方规则）
- 帖子 ID 使用无规律短链（8位字母数字混合，应用层生成）
- 支持上传图片和附件

**支持的 Markdown 标签：**

| 标签     | 语法                 | 说明                 |
| -------- | -------------------- | -------------------- |
| 粗体     | `**text**`           | 加粗文字             |
| 斜体     | `*text*` 或 `_text_` | 斜体文字             |
| 删除线   | `~~text~~`           | 删除线文字           |
| 行内代码 | `` `code` ``         | 行内代码             |
| 链接     | `[text](url)`        | 自动转换为可点击链接 |
| 换行     | 连续两行空行         | 段落分隔             |

**不支持的标签：** 标题（#）、列表、引用、代码块、图片（`![]()`）、表格等。原因：微博是短内容生态，复杂格式影响阅读体验，且避免 SEO 滥用。

**内容存储策略：**

- 数据库存储**原始 Markdown** 内容（不渲染）
- 前端展示时渲染 Markdown
- @提及和 #标签 在存储前预处理为可解析格式

#### 3.2.2 可见度规则

| 值          | 说明             | 可见范围                                  |
| ----------- | ---------------- | ----------------------------------------- |
| `public`    | 全部             | 所有人可见，出现在公开时间线、搜索、SEO   |
| `logged_in` | 仅登录用户       | 已登录用户可见，未登录不可见              |
| `followers` | 粉丝可见         | 仅关注者可见                              |
| `following` | 我关注的用户可见 | 仅我关注的人可见                          |
| `private`   | 仅自己           | 仅作者本人可见                            |
| `password`  | 指定密码         | 输入正确密码后可见，需额外字段 `password` |
| `users`     | 指定用户         | 指定的 `allowed_user_ids` 列表可见        |

**可见度对功能的影响：**

| 可见度    | 公开时间线 | 搜索可见 | SEO收录 | 通知触发 |
| --------- | ---------- | -------- | ------- | -------- |
| public    | ✅         | ✅       | ✅      | ✅       |
| logged_in | ❌         | ❌       | ❌      | ✅       |
| followers | ❌         | ❌       | ❌      | ✅       |
| following | ❌         | ❌       | ❌      | ✅       |
| private   | ❌         | ❌       | ❌      | ❌       |
| password  | ❌         | ❌       | ❌      | ✅       |
| users     | ❌         | ❌       | ❌      | ✅       |

**密码保护交互：**

- 帖子展示区域显示密码输入框
- 输入正确密码后，在 N 分钟内不再需要重新输入
- N 的值由环境变量 `PASSWORD_PROTECT_EXPIRE_MINUTES` 控制，默认 10 分钟

#### 3.2.3 文件上传

**图片：**

- 支持 jpg、png、gif、webp
- 单文件最大 5MB
- 图片压缩优化

**附件：**

- 支持常见文档、压缩包等格式
- 单文件最大 20MB
- 附件类型白名单可配置

**通用规则：**

- 本地开发存本地目录，生产用 R2
- 存储路径可自定义配置
- 文件名使用 MD5 哈希替代原始文件名
- 基于 MD5 去重：相同文件共享存储，引用计数管理
- 仅当引用计数归零时才真实删除物理文件
- 上传后返回文件访问路径

#### 3.2.4 编辑微博

- 仅微博作者可编辑
- 编辑自动保存历史版本（PostRevision）
- 标记"已编辑"及编辑时间
- 支持修改内容、增删图片、增删附件
- 版本历史支持 diff 对比
- 版本历史包含完整的图片和附件快照

#### 3.2.5 置顶

| 类型     | 操作者   | 位置               | 数量限制                                  |
| -------- | -------- | ------------------ | ----------------------------------------- |
| 个人置顶 | 帖子作者 | 用户主页顶部       | 由 `MAX_USER_PINNED_POSTS` 配置，默认 1   |
| 全局置顶 | 管理员   | 首页热门时间线顶部 | 由 `MAX_GLOBAL_PINNED_POSTS` 配置，默认 3 |

**置顶关闭：** 当环境变量中最大置顶数为 0 时，关闭对应置顶功能（用户不可置顶 / 管理员不可全局置顶）。

#### 3.2.6 锁定

- 作者和管理员均可锁定帖子
- 锁定后：不允许编辑、不允许发新评论、已有评论隐藏
- **管理员锁定的帖子，用户不能解锁**（通过 `lockedBy` 字段区分）
- 管理员锁定时必须注明理由
- 管理员可解锁任何帖子

#### 3.2.7 删除与恢复

**用户删除：**

- 帖子软删除（`isDeleted = true`）
- 删除后帖子详情页显示"该内容已删除"
- 关联图片/附件引用计数减 1，归零时删除物理文件

**管理员删除：**

- 管理员删除帖子时必须注明理由
- 理由记录在帖子数据中

**管理员恢复：**

- 管理员可恢复用户已删除的帖子
- 恢复时必须注明理由
- 恢复后关联图片/附件引用计数恢复

### 3.3 互动功能

#### 3.3.1 评论

- 支持二级评论（回复评论）
- 评论可点赞
- 评论计入微博评论数
- 评论字数上限 1000 字符（含 Markdown 源码）
- 评论继承帖子可见度
- 评论排序：默认时间正序，用户可切换倒序，排序偏好保存到用户设置
- 评论软删除，删除后显示"该内容已删除"

#### 3.3.2 点赞

- 支持微博点赞和评论点赞
- 同一用户对同一目标只能点赞一次
- 可取消点赞
- API 使用 PUT 切换模式：已点赞则取消，未点赞则点赞

#### 3.3.3 关注

- 关注/取关用户
- 关注数、粉丝数统计
- `/following` 页面：当前登录用户关注的人的帖子时间线
- `/followers` 页面：当前登录用户的粉丝列表
- API 使用 PUT 切换模式：已关注则取关，未关注则关注

### 3.4 内容功能

#### 3.4.1 @提及

- 发帖时 @username 自动识别
- 被@用户收到通知
- 点击跳转到用户主页

#### 3.4.2 #话题标签

- 发帖时 #tag# 自动识别
- 标签聚合页 `/tags/[tag]`：列出使用该标签的所有微博
- 标签使用次数统计
- 管理员可隐藏标签：隐藏后全站不展示、不可点击、不可搜索、不可公开访问

#### 3.4.3 时间线

| 类型         | 页面          | 说明                                       |
| ------------ | ------------- | ------------------------------------------ |
| 热门时间线   | `/`           | 全站公开帖子，热门排序，全局置顶帖优先     |
| 最新时间线   | `/latest`     | 全站公开帖子，按时间倒序                   |
| 关注时间线   | `/following`  | 关注的人的帖子，按时间倒序                 |
| 用户主页微博 | `/[username]` | 该用户发布的帖子，置顶帖优先，支持帖子搜索 |

**热门排序算法：**

- 热门排序公式通过环境变量 `TRENDING_FORMULA` 配置
- 默认公式参考：综合点赞数、评论数、时间衰减等因素

**分页方式：**

- 用户模式：无限滚动（游标分页）
- SEO 模式：页码分页（确保搜索引擎可抓取）

#### 3.4.4 搜索

**全局搜索（`/search`）：**

- 分为两个区域：用户搜索、微博搜索
- 用户搜索：按用户名、显示名搜索
- 微博搜索：按内容搜索
- LIKE 查询，起步够用

**用户主页搜索：**

- 在用户主页内搜索该用户的帖子
- 按帖子内容关键词过滤

### 3.5 通知系统

#### 3.5.1 通知类型

| 事件              | 通知类型 |
| ----------------- | -------- |
| 被关注            | follow   |
| 评论你的微博      | comment  |
| 点赞你的微博/评论 | like     |
| @你               | mention  |

#### 3.5.2 通知功能

- 站内通知列表（`/notifications`）
- 未读数量显示
- 标记已读
- 邮件通知：后续增加
- Webhook 通知：可配置（见 3.6）

### 3.6 Webhook 系统

#### 3.6.1 配置（个人设置内）

- Webhook URL 设置
- Webhook Secret（签名密钥）
- 选择触发事件类型
- 启用/禁用

#### 3.6.2 Webhook 格式

```json
{
	"event": "notification.created",
	"timestamp": "2026-06-03T12:00:00Z",
	"signature": "sha256=xxxxx",
	"data": {
		"id": "notif_xxx",
		"type": "mention",
		"actor": { "id": "user_xxx", "username": "zhangsan" },
		"post": { "id": "post_xxx", "content": "提到了你..." }
	}
}
```

#### 3.6.3 安全

- HMAC-SHA256 签名验证
- Header: `X-Webhook-Signature: sha256=<signature>`

### 3.7 API Token 管理

- 用户可在个人设置中生成多个 API Token
- Token 名称管理（如"我的客户端"、"自动化工具"）
- Token 权限：等同于用户权限
- Token 撤销功能
- Token 最后使用时间记录
- 认证方式：`Authorization: Bearer <token>`

### 3.8 个人设置

| 设置项    | 说明                                    |
| --------- | --------------------------------------- |
| 个人资料  | 头像、显示名、简介                      |
| 密码修改  | 修改登录密码                            |
| 主题      | 亮色/暗色/护眼/高对比度等，切换后持久化 |
| 评论排序  | 正序/倒序偏好                           |
| API Token | Token 创建/管理/撤销                    |
| Webhook   | Webhook 创建/管理/删除                  |

### 3.9 主题系统

- 预置主题：亮色（Light）、暗色（Dark）、护眼（Eye-care）、高对比度（High Contrast）
- 可扩展更多主题
- 用户选择后持久化到 UserSettings，下次登录保持
- 后续规划：用户自定义 CSS

### 3.10 管理后台

#### 3.10.1 仪表盘（`/admin`）

| 数据项         | 说明           |
| -------------- | -------------- |
| 总用户数       | 系统用户总数   |
| 总帖子数       | 发布帖子总数   |
| 总评论数       | 评论总数       |
| 总关注数       | 关注关系总数   |
| 今日新增用户   | 今日注册用户数 |
| 今日新增帖子   | 今日发布帖子数 |
| 近30天帖子趋势 | 每日发帖数图表 |
| 最近活动       | 最新10条动态   |

#### 3.10.2 用户管理（`/admin/users`）

- 用户列表、搜索
- 禁用/启用用户
- 查看用户详情

#### 3.10.3 帖子管理（`/admin/posts`）

- 帖子列表、搜索
- 删除帖子（需注明理由）
- 恢复已删除帖子（需注明理由）
- 全局置顶/取消置顶
- 锁定帖子（需注明理由）/ 解锁帖子
- 查看帖子历史

#### 3.10.4 评论管理（`/admin/comments`）

- 评论列表
- 删除评论

#### 3.10.5 标签管理（`/admin/tags`）

- 标签列表、使用次数统计
- 隐藏/显示标签
- 隐藏效果：全站不展示、不可点击、不可搜索、不可公开访问

### 3.11 操作记录

系统自动记录用户操作，便于追踪和审计。

**记录的操作类型：**

| 操作类型       | 说明     |
| -------------- | -------- |
| post.create    | 发帖     |
| post.update    | 编辑帖子 |
| post.delete    | 删除帖子 |
| comment.create | 发表评论 |
| comment.delete | 删除评论 |
| like.create    | 点赞     |
| like.remove    | 取消点赞 |
| follow\.create | 关注     |
| follow\.remove | 取消关注 |

**记录内容：**

- 操作类型
- 操作者 ID
- 目标类型（帖子/评论/用户）
- 目标 ID（帖子 ID / 评论 ID / 用户 ID）
- 原始用户 ID（被操作内容的作者）
- 帖子标识（关联的帖子 ID，便于快速定位）
- 操作时间

---

## 四、数据模型

### 4.1 站点配置（.env 环境变量）

站点配置通过 `.env` 文件管理，不存储在数据库中。修改后需重启服务生效。

| 环境变量                          | 类型    | 默认值                         | 说明                                             |
| --------------------------------- | ------- | ------------------------------ | ------------------------------------------------ |
| `SITE_TITLE`                      | string  | `"Mutan"`                      | 站点标题                                         |
| `SITE_DESCRIPTION`                | string  | `"世间纷纷扰扰，此处和睦相谈"` | 站点描述                                         |
| `SITE_LOGO_URL`                   | string  | `""`                           | Logo 图片 URL                                    |
| `SITE_FAVICON_URL`                | string  | `""`                           | Favicon URL                                      |
| `ALLOW_REGISTRATION`              | boolean | `true`                         | 是否允许注册（设为 `false` 关闭）                |
| `PASSWORD_PROTECT_EXPIRE_MINUTES` | number  | `10`                           | 密码保护过期时间（分钟）                         |
| `DISABLED_USER_MESSAGE`           | string  | `"该用户已被禁用"`             | 被禁用用户提示信息                               |
| `MAX_GLOBAL_PINNED_POSTS`         | number  | `3`                            | 全局置顶帖上限                                   |
| `MAX_USER_PINNED_POSTS`           | number  | `1`                            | 用户置顶帖上限                                   |
| `TRENDING_FORMULA`                | string  | `""`                           | 热门排序公式配置                                 |
| `EXTRA_RESERVED_USERNAMES`        | string  | `""`                           | 额外保留用户名（逗号分隔，追加到内置保留词列表） |

### 4.2 User（用户）

```prisma
model User {
  id           String    @id @default(cuid())
  username     String    @unique
  displayName  String
  email        String    @unique
  passwordHash String
  avatarUrl    String    @default("")
  bio          String    @default("")
  role         String    @default("user")  // user, admin — 预留扩展
  isDisabled   Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  posts              Post[]
  comments           Comment[]
  likes              Like[]
  followers          Follow[]  @relation("UserFollowers")
  following          Follow[]  @relation("UserFollowing")
  settings           UserSettings?
  apiTokens          ApiToken[]
  webhooks           Webhook[]
  sentNotifications  Notification[] @relation("NotificationActor")
  receivedNotifications Notification[] @relation("NotificationRecipient")
  mentions           Mention[]
  activityLogs       ActivityLog[]
}
```

### 4.3 Post（帖子）

```prisma
model Post {
  id             String    @id  // 应用层生成 8 位无规律短链
  userId         String
  content        String
  visibility     String    @default("public")
  passwordHash   String?   // password 可见度用
  allowedUserIds String?   // users 可见度用，JSON 数组
  isPinned       Boolean   @default(false)   // 用户主页置顶
  isGlobalPinned Boolean   @default(false)   // 管理员全局置顶
  isLocked       Boolean   @default(false)   // 锁定：禁止编辑和评论
  lockedBy       String?   // 锁定者 ID（区分管理员/用户锁定）
  lockReason     String?   // 锁定理由
  isDeleted      Boolean   @default(false)   // 软删除
  deleteReason   String?   // 删除理由（管理员删除时填写）
  deletedBy      String?   // 删除者 ID
  restoreReason  String?   // 恢复理由（管理员恢复时填写）
  restoredBy     String?   // 恢复者 ID
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user       User           @relation(fields: [userId], references: [id])
  media      Media[]
  revisions  PostRevision[]
  comments   Comment[]
  likes      Like[]
  tags       PostTag[]
  mentions   Mention[]
}
```

### 4.4 PostRevision（版本历史）

```prisma
model PostRevision {
  id        String   @id @default(cuid())
  postId    String
  content   String
  mediaSnapshot  String?  // 快照：关联的图片/附件 ID 列表（JSON 数组）
  createdAt DateTime @default(now())

  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
}
```

### 4.5 Comment（评论）

```prisma
model Comment {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  parentId  String?  // 二级评论父 ID
  content   String
  isDeleted Boolean  @default(false)  // 软删除
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  post      Post     @relation(fields: [postId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  parent    Comment? @relation(fields: [parentId], references: [id])
  replies   Comment[]
  likes     Like[]
}
```

### 4.6 Like（点赞）

```prisma
model Like {
  id        String   @id @default(cuid())
  userId    String
  postId    String?
  commentId String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  post      Post?    @relation(fields: [postId], references: [id])
  comment   Comment? @relation(fields: [commentId], references: [id])

  @@unique([userId, postId])
  @@unique([userId, commentId])
}
```

### 4.7 Follow（关注）

```prisma
model Follow {
  id          String   @id @default(cuid())
  followerId  String
  followingId String
  createdAt   DateTime @default(now())

  follower    User     @relation("UserFollowers", fields: [followerId], references: [id])
  following   User     @relation("UserFollowing", fields: [followingId], references: [id])

  @@unique([followerId, followingId])
}
```

### 4.8 FileStorage（文件存储）

```prisma
model FileStorage {
  id        String   @id @default(cuid())
  md5Hash   String   @unique  // MD5 哈希，用于去重
  filePath  String            // 实际文件路径（本地或 R2）
  fileSize  Int
  mimeType  String
  fileType  String   @default("image")  // image / attachment
  refCount  Int      @default(1)  // 引用计数
  createdAt DateTime @default(now())

  media     Media[]
}
```

### 4.9 Media（媒体附件）

```prisma
model Media {
  id            String   @id @default(cuid())
  postId        String
  fileStorageId String
  fileType      String   @default("image")  // image / attachment
  originalName  String   @default("")  // 原始文件名（附件保留）
  sortOrder     Int      @default(0)  // 排序
  createdAt     DateTime @default(now())

  post          Post         @relation(fields: [postId], references: [id])
  fileStorage   FileStorage  @relation(fields: [fileStorageId], references: [id])
}
```

### 4.10 Tag（标签）

```prisma
model Tag {
  id        String   @id @default(cuid())
  name      String   @unique
  isHidden  Boolean  @default(false)  // 管理员隐藏
  createdAt DateTime @default(now())

  posts     PostTag[]
}
```

### 4.11 PostTag（帖子-标签关联）

```prisma
model PostTag {
  id     String @id @default(cuid())
  postId String
  tagId  String

  post   Post   @relation(fields: [postId], references: [id])
  tag    Tag    @relation(fields: [tagId], references: [id])

  @@unique([postId, tagId])
}
```

### 4.12 Mention（提及）

```prisma
model Mention {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  createdAt DateTime @default(now())

  post      Post     @relation(fields: [postId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
}
```

### 4.13 ApiToken（API Token）

```prisma
model ApiToken {
  id         String    @id @default(cuid())
  userId     String
  name       String    // Token 名称
  tokenHash  String    // Token 哈希（不存明文）
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())

  user       User      @relation(fields: [userId], references: [id])
}
```

### 4.14 Webhook

```prisma
model Webhook {
  id        String   @id @default(cuid())
  userId    String
  url       String
  secret    String   // HMAC-SHA256 签名密钥
  events    String   // JSON 数组，触发事件类型
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id])
}
```

### 4.15 Notification（通知）

```prisma
model Notification {
  id          String   @id @default(cuid())
  type        String   // follow, comment, like, mention
  actorId     String   // 触发者
  recipientId String   // 接收者
  postId      String?
  commentId   String?
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())

  actor       User     @relation("NotificationActor", fields: [actorId], references: [id])
  recipient   User     @relation("NotificationRecipient", fields: [recipientId], references: [id])
}
```

### 4.16 UserSettings（用户设置）

```prisma
model UserSettings {
  id              String   @id @default(cuid())
  userId          String   @unique
  theme           String   @default("light")  // light, dark, eye-care, high-contrast
  commentSortOrder String  @default("asc")     // asc, desc
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id])
}
```

### 4.17 ActivityLog（操作记录）

```prisma
model ActivityLog {
  id          String   @id @default(cuid())
  action      String   // 操作类型：post.create, post.update, post.delete, comment.create, comment.delete, like.create, like.remove, follow.create, follow.remove
  actorId     String   // 操作者 ID
  targetType  String   // 目标类型：post, comment, user
  targetId    String   // 目标 ID
  targetUserId String? // 原始用户 ID（被操作内容的作者）
  postId      String?  // 关联帖子 ID（便于快速定位）
  createdAt   DateTime @default(now())

  actor       User     @relation(fields: [actorId], references: [id])
}
```

---

## 五、安全策略

| 领域 | 策略                              |
| ---- | --------------------------------- |
| 密码 | bcrypt 加密存储                   |
| JWT  | HS256 签名，7天有效，自动续期     |
| SQL  | Prisma 参数化查询，防注入         |
| XSS  | Markdown 白名单标签，禁用危险协议 |
| CSRF | CSRF Token 防护                   |
| 文件 | 类型白名单 + 大小校验 + MD5 去重  |
| API  | 限流防护                          |

---

## 六、非功能需求

### 6.1 性能

- 页面加载 < 2秒
- API 响应 < 500ms
- 支持 1000 并发用户（起步）

### 6.2 SEO

- SSR 渲染，搜索引擎可抓取
- Meta 标签（title、description、og:image）
- Sitemap 生成
- robots.txt
- 公开帖子 title 含用户名，meta 含内容摘要

### 6.3 可扩展性

- 数据库可从 SQLite 迁移到 MySQL
- 存储可从本地迁移到 R2/OSS
- 搜索可从 LIKE 升级到 Typesense
- 用户角色可扩展（当前 user/admin，预留 moderator 等）

---

## 七、目录结构

```
mutan-next/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── pages/
│   │   ├── api/                    # REST API
│   │   │   ├── auth/               # 认证接口
│   │   │   ├── posts/              # 帖子接口
│   │   │   ├── comments/           # 评论接口
│   │   │   ├── users/              # 用户接口
│   │   │   ├── timeline/           # 时间线接口
│   │   │   ├── search/             # 搜索接口
│   │   │   ├── tags/               # 标签接口
│   │   │   ├── upload/             # 上传接口
│   │   │   ├── notifications/      # 通知接口
│   │   │   ├── settings/           # 个人设置接口
│   │   │   ├── tokens/             # API Token 接口
│   │   │   ├── webhooks/           # Webhook 接口
│   │   │   └── admin/              # 管理后台接口
│   │   ├── index.astro             # 首页（热门）
│   │   ├── latest.astro            # 最新时间线
│   │   ├── login.astro             # 登录
│   │   ├── register.astro          # 注册
│   │   ├── search.astro            # 搜索（分区）
│   │   ├── following.astro         # 关注时间线
│   │   ├── followers.astro         # 粉丝列表
│   │   ├── notifications.astro     # 通知
│   │   ├── settings/               # 个人设置
│   │   ├── admin/                  # 管理后台
│   │   │   ├── index.astro         # 仪表盘
│   │   │   ├── users.astro         # 用户管理
│   │   │   ├── posts.astro         # 帖子管理
│   │   │   ├── comments.astro      # 评论管理
│   │   │   └── tags.astro          # 标签管理
│   │   ├── tags/
│   │   │   └── [tag].astro         # 标签聚合页
│   │   ├── [username]/
│   │   │   ├── index.astro         # 用户主页（含帖子搜索）
│   │   │   └── [postId]/
│   │   │       ├── index.astro     # 帖子详情
│   │   │       ├── edit.astro      # 编辑帖子
│   │   │       └── revisions.astro # 版本历史
│   ├── components/                 # Islands
│   └── lib/
│       ├── auth.ts                 # 认证工具（JWT、密码哈希）
│       ├── shortid.ts              # 短链 ID 生成
│       ├── markdown.ts             # Markdown 渲染
│       ├── upload.ts               # 文件上传/去重
│       ├── trending.ts             # 热门排序算法
│       └── ...                     # 工具函数
└── public/
```

---

## 八、后续规划

以下功能不在首期范围，记录于此便于后续迭代：

| 功能       | 说明                                  |
| ---------- | ------------------------------------- |
| 邮箱验证   | 注册时邮箱验证码验证                  |
| 邮件通知   | 站内通知同步发送邮件，用户可配置开关  |
| 转发/引用  | 支持引用他人帖子并转发，附评论        |
| 国际化     | 多语言支持                            |
| 自定义 CSS | 用户可编写自定义 CSS 覆盖主题样式     |
| 更多主题   | 在预置主题基础上增加更多风格          |
| 搜索升级   | 从 LIKE 查询升级到 Typesense 全文搜索 |
| 数据库迁移 | 从 SQLite 迁移到 MySQL                |

---

## 九、验收标准

### 9.1 用户体系

- [ ] 用户可通过邮箱注册账号
- [ ] 注册后收到欢迎邮件
- [ ] 用户可登录/登出
- [ ] 用户主页展示完整资料
- [ ] 用户名不能为系统保留词
- [ ] 注册关闭时显示"注册已关闭"提示
- [ ] 管理员可禁用/启用用户
- [ ] 禁用用户帖子隐藏，评论显示提示词

### 9.2 微博功能

- [ ] 可发布带文字、图片和附件的微博（文字最多1000字，图片最多9张）
- [ ] 微博内容支持 Markdown 格式（粗体、斜体、删除线、代码、链接）
- [ ] Markdown 内容正确渲染
- [ ] 可设置微博可见度（7种）
- [ ] 可见度为密码时，输入正确密码可查看，会话期内免重复输入
- [ ] 可见度为指定用户时，仅指定用户可查看
- [ ] 可编辑已发布的微博（含增删图片和附件）
- [ ] 编辑后显示"已编辑"标记
- [ ] 可查看微博历史版本
- [ ] 可 diff 对比两个版本差异
- [ ] 版本历史包含图片和附件快照
- [ ] 可置顶帖子（用户主页 + 管理员全局）
- [ ] 最大置顶数为 0 时置顶功能关闭
- [ ] 可锁定帖子（禁止编辑和评论）
- [ ] 管理员锁定的帖子用户不能解锁
- [ ] 管理员锁定需注明理由
- [ ] 帖子软删除，显示"该内容已删除"
- [ ] 管理员删除帖子需注明理由
- [ ] 管理员可恢复已删除帖子并注明理由
- [ ] 帖子 ID 为无规律短链

### 9.3 互动功能

- [ ] 可评论微博/回复评论
- [ ] 评论继承帖子可见度
- [ ] 评论排序可切换，偏好持久化
- [ ] 可点赞微博/评论（PUT 切换模式）
- [ ] 可关注/取关用户（PUT 切换模式）
- [ ] 粉丝数、关注数正确统计

### 9.4 内容功能

- [ ] @提及自动识别并跳转
- [ ] \#标签自动识别并可点击
- [ ] 标签聚合页正确展示
- [ ] 管理员可隐藏标签
- [ ] 首页热门时间线按热门排序展示
- [ ] 最新时间线按时间倒序展示
- [ ] 关注时间线显示关注用户的帖子
- [ ] 全局搜索分区展示（用户搜索 + 微博搜索）
- [ ] 用户主页可搜索该用户的帖子

### 9.5 API 系统

- [ ] 可生成/撤销 API Token
- [ ] 可通过 Token 访问 API
- [ ] `/api/docs` 显示 Scalar API 文档
- [ ] 所有 API 接口正常工作

### 9.6 通知系统

- [ ] 被关注/评论/点赞/@时收到通知
- [ ] 可查看通知列表
- [ ] 可标记通知已读
- [ ] 未读数量正确显示

### 9.7 Webhook

- [ ] 可配置 Webhook URL
- [ ] 触发事件时发送 Webhook 请求
- [ ] Webhook 请求包含 HMAC-SHA256 签名验证

### 9.8 管理后台

- [ ] 仪表盘显示统计数据
- [ ] 管理员可查看/搜索/禁用用户
- [ ] 管理员可查看/搜索/删除帖子（需理由）
- [ ] 管理员可恢复已删除帖子（需理由）
- [ ] 管理员可全局置顶帖子
- [ ] 管理员可锁定帖子（需理由）/解锁帖子
- [ ] 管理员可管理评论
- [ ] 管理员可隐藏/显示标签
- [ ] 管理员可查看操作记录

### 9.9 其他

- [ ] 主题切换正常，偏好持久化
- [ ] 图片和附件上传、去重、引用计数正常
- [ ] 操作记录正确记录各类用户行为
- [ ] Sitemap 和 robots.txt 正确生成
- [ ] SEO：公开帖子可被搜索引擎收录
