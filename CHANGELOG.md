# 更新日志

### 2026-08-05

**提交人**: 林冲
**影响范围**: Service/Lib 分层、账户设置组件、编辑器预览、环境配置
**变更类型**: 优化 / 安全加固

**详细描述**:

- 将 `content.service.ts` 与 `user.service.ts` 的 Prisma 查询下沉至 `lib/post.ts`、`lib/comment.ts` 与 `lib/user.ts`，保持既有 Service 接口不变。
- 新增公共 `escapeHtml` 工具，并用于 Token、Webhook 及编辑器上传文件预览中的动态 HTML 值。
- 新增 `HOT_SORT_CANDIDATE_WINDOW` 配置，默认保留 200 条热门排序候选。

**注意事项**:

- `HOT_SORT_CANDIDATE_WINDOW` 必须为正数；无效值会回退至默认值 200。

### 2026-06-21 19:30

**提交人**: AI
**提交哈希**: ab499e9
**影响范围**: actions 层（3 文件）、api 层（10 文件）、services 层（5 文件新增/扩展）、lib 层（3 文件扩展）
**变更类型**: 重构

**详细描述**:
- 重构 actions/content.ts：createPost/updatePost/deletePost 业务逻辑下沉到 content.service.ts
- 重构 actions/settings.ts：changePassword/uploadAvatar/updateCommentSort 下沉到 settings.service.ts
- 重构 actions/misc.ts：renderMarkdown 下沉到 misc.service.ts
- 重构 api/agent/posts/：GET/POST 委托 content.service.ts
- 重构 api/agent 其余 8 个文件：移除 prisma 直接调用，委托 service 层
- 新建 services/misc.service.ts、services/user.service.ts
- 扩展 lib/post.ts（事务函数）、lib/upload.ts（文件查询）、lib/tag.ts（标签查询）
- content.service.ts 新增 createPost/updatePost/deletePost/getAgentPosts/getAgentPostDetail
- settings.service.ts 新增 changePassword/uploadAvatar/updateCommentSort

**注意事项**:
- actions/api 层不再直接 import prisma 或跨层调用 lib
- 业务逻辑完全不变，纯架构调整

### 2026-06-21 18:00

**提交人**: AI
**提交哈希**: 1de2f0f
**影响范围**: lib 层（7 个新文件 + 3 个扩展）、services 层（13 个文件重构）
**变更类型**: 重构

**详细描述**:

- 新建 lib 层数据库操作模块：user.ts、post.ts、comment.ts、social.ts、category.ts、tag.ts、settings.ts
- 扩展已有 lib 模块：notification.ts（+4 函数）、token.ts（+4 函数）、webhook.ts（+5 函数）
- 重构全部 13 个 service 文件，移除 prisma 直接调用，改为调用 lib 层函数
- 修复 social.ts 中 findFollowingIds/findFollowerIds 重复定义的严重 bug
- 修复 settings.ts 的 import type 一致性、category.ts 的 select 泛型类型
- 修复 search.service.ts 的命名冲突和类型推断问题
- 修复 notification.service.ts 的 findPostsByIds select 类型推断问题

**注意事项**:

- 本次重构为纯架构调整，业务逻辑无变化
- Service 层不再直接 import prisma，所有数据库操作收敛到 lib 层
- 格式化和类型检查均已通过

### 2026-06-20 16:00

**提交人**: AI
**提交哈希**: 5902805
**影响范围**: 推荐系统（全栈）、文档、配置
**变更类型**: 重构

**详细描述**:

- 移除 Gorse 推荐引擎全部代码，替换为自建 DaLi.Lens 推荐中间件
- 新增 `src/lib/lens.ts`：DaLi.Lens 客户端封装（单例、优雅降级、统一 callLens）
- 重写 `src/services/recommend.service.ts`：基于 Lens API 实现个性化推荐、相似推荐、浏览记录、用户画像
- 重写 `src/actions/recommend.ts`：新增 getSimilarPosts、getUserProfile Actions
- 更新 `src/actions/content.ts`：帖子 CRUD 改用 ingestDocument/updateDocument/deleteDocument
- 更新 `src/services/content.service.ts`：评论反馈改用 submitFeedback(FEEDBACK_ACTION_COMMENT)
- 更新 `src/services/social.service.ts`：点赞/收藏反馈改用 submitFeedback(click/fav)
- 更新 `src/services/auth.service.ts`：注册时异步同步用户到 Lens（createUser）
- 更新 `src/pages/index.astro`：推荐区域改用 isLensEnabled
- 更新 `src/pages/[username]/[postId]/index.astro`：浏览反馈改用 view，新增"相关推荐"区域
- 更新 `src/lib/config.ts`：移除 GORSE_ENDPOINT/GORSE_API_KEY，新增 LENS_ENDPOINT/LENS_API_KEY
- 删除 `src/lib/gorse.ts`，移除 `gorsejs` 依赖
- 更新 `.env.example`、`README.md`、`CLAUDE.md`、`docs/plan/M7-知音.md` 中所有 Gorse 引用
- 修复 `social.service.ts` 中 comment.id 类型错误（select 缺少 id 字段）
- 修复 `recommend.service.ts` 中 visiblePosts 隐式 any 类型

**注意事项**:

- 需配置 LENS_ENDPOINT 和 LENS_API_KEY 环境变量，否则推荐功能静默停用
- 反馈类型映射：bookmark→fav, like→click, read→view, comment→comment
- 取消点赞/取消收藏不发送负向反馈（Lens 无 dislike 类型）

### 2026-06-08 14:00

**提交人**: AI
**提交哈希**: 82365da
**影响范围**: 全站 Actions 客户端调用
**变更类型**: 修复

**详细描述**:

- 修复 Astro 6 Actions 客户端 API 适配问题：Actions 返回 SafeResult（{ data, error }），不抛异常
- 登录/注册页面：错误密码不再直接跳转首页，正确显示错误信息
- 全部 25 个 .astro 文件的 actions 调用从 try/catch 改为 result.error 检查
- 成功数据从 result.data 获取，而非直接从 result 获取
- 修复 BookmarkButton/FollowButton/LikeButton 语法错误（多余缩进和闭合大括号）

**注意事项**:

- Astro 6 Actions 客户端不抛异常，必须检查 result.error
- 此前登录失败时 result.token 为 undefined，被写入 localStorage 导致异常行为

### 2026-06-08 21:30

**提交人**: AI
**提交哈希**: 215e2bc
**影响范围**: 全站 .astro 客户端脚本中的 actions 调用
**变更类型**: 修复

**详细描述**:

- 修复所有 .astro 文件中 `await actions.xxx()` 的客户端代码，适配 Astro 6 SafeResult API
- Astro 6 Actions 客户端 API 返回 `{ data, error }` 而非抛异常，需检查 `result.error` 判断失败
- 成功数据从 `result.data` 获取（如 `result.data.items`、`result.data.success`）
- 移除所有基于 try/catch 的错误处理，改为 `result.error` 检查
- 原来 catch 中检查 `e.status === 401` 改为 `(result.error as any).status === 401`
- 原来 catch 中检查 `e.message` 改为 `result.error.message`
- 不关心返回值的操作（如 updateTheme）直接 await，无需 try/catch
- 修复 BookmarkButton/FollowButton/LikeButton 因之前编辑遗留的多余缩进和闭合大括号导致的语法错误

**涉及文件**（25个）:

- Base.astro, SearchResults.astro, admin/categories.astro, [username]/[postId]/index.astro
- settings/index.astro, notifications.astro, index.astro
- AdminUserList.astro, AdminPostList.astro, AdminTagList.astro, AdminCommentList.astro
- CommentForm.astro, ForumEditor.astro, CommentItem.astro, NotificationList.astro
- ThemeSwitcher.astro, BookmarkButton.astro, LikeButton.astro, FollowButton.astro
- PostEditor.astro, PostEditForm.astro, WebhookManager.astro, TokenManager.astro
- ComposeModal.astro, SearchSuggest.astro, blog/write.astro, [username]/[postId]/edit.astro

**注意事项**:

- login.astro 和 register.astro 已在之前修复，无需再改
- 所有修改仅涉及客户端脚本中的 actions 调用模式，不影响服务端逻辑

### 2026-06-08 13:26

**提交人**: AI
**提交哈希**: d5da615
**影响范围**: 登录/注册/登出
**变更类型**: 修复

**详细描述**:

- 修复登录后用户菜单不显示的问题：移除客户端 `document.cookie` 设置，避免覆盖服务端 HttpOnly cookie
- 登录/注册页面不再手动设置 cookie，完全依赖服务端 `setTokenCookie` 设置的 HttpOnly cookie
- 登出时增加 `document.cookie` 清除，确保残留的客户端 cookie 被清理

**注意事项**:

- SSR 页面通过 HttpOnly cookie 读取用户状态，客户端通过 localStorage 读取 token

### 2026-06-08 13:12

**提交人**: AI
**提交哈希**: 25e5e07
**影响范围**: 导航栏
**变更类型**: 优化

**详细描述**:

- 导航栏改为三栏布局：品牌（左）| 频道导航（居中）| 操作区（右）
- 未登录用户右上角显示登录🔑/注册📝图标按钮，点击跳转对应页面
- 频道导航居中显示，仅启用一个模块时不显示（`isSingleMode` 控制）
- 移动端恢复 hamburger 切换按钮，修复 JS 中 ID 引用与 HTML 不匹配的问题
- 清理 Base.astro 中 layoutMode 残留代码，改为 narrow 布尔值

**注意事项**:

- 单模式站点不显示频道导航链接
- 移动端通过 hamburger 面板访问导航和登录注册

### 2026-06-08 05:00

**提交人**: AI
**提交哈希**: 29b352d
**影响范围**: 全站模式名称显示
**变更类型**: 新增

**详细描述**:

- 新增环境变量 SITE_MODE_WEIBO / SITE_MODE_FORUM / SITE_MODE_BLOG，支持自定义模式显示别名
- 新增 `getModeLabel()` 函数（src/lib/config.ts），统一获取模式显示名称
- 15 个文件中的硬编码"微博/论坛/博客"替换为 `getModeLabel()` 调用
- .env.example 添加模式别名配置说明

**注意事项**:

- 未设置别名环境变量时，默认显示名称不变（微博/论坛/博客）
- 路由路径和 mode 数据标识不受影响

### 2026-06-07 20:15

**提交人**: AI
**提交哈希**: a800edc
**影响范围**: 首页布局
**变更类型**: 重构

**详细描述**:

- 新增 HomeLayout（居中 960px 无侧边栏），首页作为全站数据聚合入口
- 首页从 WeiboLayout 切换到 HomeLayout，移除侧边栏
- 首页标题改为"发现"，副标题根据登录状态显示个性化提示
- 用户主页从 WeiboLayout 切换到 UserLayout（居中 800px 无侧边栏）

### 2026-06-07 20:10

**提交人**: AI
**提交哈希**: 0242c06
**影响范围**: 布局系统、Service 层、搜索功能、用户界面
**变更类型**: 重构 | 修复 | 新增

**详细描述**:

- 引入 Service 层架构，消除 Actions 与 API 的业务逻辑重复
    - 新增 src/lib/errors.ts（ServiceError 错误类）
    - 新增 src/services/ 目录，包含 15 个业务编排模块
    - 所有 Actions 改造为薄适配层（鉴权 + zod 校验 + 委托 service）
    - 8 个 Agent API 改为调用 service
- 修复用户菜单下拉无效问题（script 标签自定义属性导致 Vite 跳过处理）
- 移除导航栏和移动端 Tab Bar 的发布按钮，各频道标题旁添加发布按钮
- 搜索建议增加帖子结果（searchSuggest 增加 posts 查询）
- 拆分布局系统：BaseLayout 为纯页面骨架，新增 4 个子 Layout
    - WeiboLayout：两栏布局（侧边栏 + 内容），用于首页/微博/关注/收藏等
    - ForumLayout：全宽 1200px 无侧边栏，用于论坛频道
    - BlogLayout：全宽 1200px 无侧边栏，用于博客频道
    - UserLayout：居中 800px 无侧边栏，用于用户主页/帖子详情/编辑/版本历史

**注意事项**:

- BaseLayout 不再处理侧边栏，由子 Layout 各自管理
- layoutMode 属性仅保留 'narrow'（登录/注册页），其他页面使用子 Layout
