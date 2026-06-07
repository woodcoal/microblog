# 更新日志

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
