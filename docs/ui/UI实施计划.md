# UI 实施计划 — 分阶段改进方案

> 本文档将 UI 方案.md（布局/组件/动效）和 UI分析报告.md（6 平台对标/优先级矩阵）合成一份**可直接执行的实施计划**。
> **Phase 1** = 仅 CSS + 模板修改，不改后端、不新增功能
> **Phase 2** = 需要新 API 端点、新 React 组件或新增功能逻辑

---

## Phase 1 — 纯 UI/UX 改进（不修改已有功能）

> 所有改动仅涉及：`src/styles/*.css`、`.astro` 模板、`src/components/*.astro`
> 不新增 API、不修改 API 响应、不新增 React islands、不修改 DB schema

### 1.1 布局系统（最高感知价值）

#### 1.1.1 内容区宽度 720px → 640px

| 文件                       | 改动                                          |
| -------------------------- | --------------------------------------------- |
| `src/styles/tokens.css:24` | `--layout-max: 720px` → `--layout-max: 640px` |

仅修改变量值，所有使用 `var(--layout-max)` 的地方自动生效。

#### 1.1.2 桌面端左侧导航栏

| 文件         | 改动                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css` | 新增 `--layout-sidebar-width: 220px`、`--layout-max-wide: 860px`、`--layout-gap: 1.5rem`                                          |
| `base.css`   | 新增 `.layout-sidebar`（桌面 220px 垂直导航）、`.layout-main`（flex 1，最大 640px）、`.layout-wide`（flex container，最大 860px） |
| `Base.astro` | 在 `<body>` 内 navbar 下方添加两栏 wrapper：sidebar + main slot                                                                   |

**sidebar 内容**（Base.astro 模板内硬编码，不涉及路由逻辑）：

```
首页    🏠 → /
最新    ⏰ → /latest
关注    👥 → /following
标签    🏷️ → /tags
通知    🔔 → /notifications
设置    ⚙️ → /settings
```

**约束**：当前导航栏链接是纯 `<a>` 标签，无需 JS 路由。

#### 1.1.3 移动端底部 Tab Bar

| 文件         | 改动                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| `base.css`   | 新增 `.tab-bar-mobile` — 固定底部、flex 水平居中、5 个图标项                    |
| `Base.astro` | 在 `</body>` 前插入底部 tab-bar（移动端 `display: flex`，桌面 `display: none`） |

**内容**：首页 / 搜索 / 发布(+) / 通知 / 个人 — 移动端标准 5 项模式。

**关键实现细节**：

- 浮动发布按钮（居中突出）使用 `position: relative; top: -12px` 配合大圆背景
- 使用 `<a>` 标签而非 JS 切换，纯 SSR 导航
- 当前选中项用 `.tab-active` 类 + `aria-current="page"`

#### 1.1.4 响应式断点对齐

| 断点         | 布局                  | 实现                                                                        |
| ------------ | --------------------- | --------------------------------------------------------------------------- |
| `< 640px`    | 单列 640px + 底部 tab | `@media (max-width: 639px)` 显示 `.tab-bar-mobile`，隐藏 `.layout-sidebar`  |
| `640~1024px` | 单列 + 顶部 navbar    | 无 sidebar，navbar 显示完整导航项                                           |
| `> 1024px`   | sidebar + main 两栏   | `@media (min-width: 1024px)` 显示 `.layout-sidebar`，隐藏 `.tab-bar-mobile` |

### 1.2 导航栏增强

#### 1.2.1 搜索入口固定化

| 文件         | 改动                                         |
| ------------ | -------------------------------------------- |
| `Base.astro` | navbar 内新增搜索图标按钮 → 链接到 `/search` |
| `base.css`   | 新增 `.nav-search-btn` 样式                  |

**行为**：点击跳转到 `/search` 页面（已有），搜索框预填 keyword（通过 URL query 传递，现有功能）。

### 1.3 搜索页面增强

#### 1.3.1 搜索框 UI 改进

| 文件              | 改动                                            |
| ----------------- | ----------------------------------------------- |
| `SearchBox.astro` | 添加搜索图标（左侧 SVG）、清除按钮（右侧 ✕）    |
| `components.css`  | 新增 `.search-box-wrapper`、`.search-clear-btn` |

#### 1.3.2 搜索结果关键词高亮

| 文件                     | 改动                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `src/pages/search.astro` | 对帖子内容、用户简介中匹配的关键词包裹 `<mark class="search-highlight">` |

**实现方式**：在 Astro frontmatter 中对 `post.content` 做 `replaceAll(query, '<mark class="search-highlight">$&</mark>')` — 纯字符串操作，无 API 变化。

#### 1.3.3 空搜索状态提示

| 文件           | 改动                                                      |
| -------------- | --------------------------------------------------------- |
| `search.astro` | 无结果时显示"试试搜索：技术 / 生活 / 旅行" 或热门标签链接 |

### 1.4 通知页面视觉升级

#### 1.4.1 通知类型图标区分

| 文件                     | 改动                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `components.css`         | 新增 `.notification-icon` + 变体 `.notification-icon-like / follow / comment / boost`，每种不同背景色 |
| `NotificationList.astro` | 根据 `notification.type` 渲染对应的图标 span                                                          |

**图标用 emoji/SVG**：❤️（like）、👤（follow）、💬（comment）、🔄（boost）

#### 1.4.2 未读通知样式

| 文件                     | 改动                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `components.css`         | 新增 `.notification-item-unread` — 左侧蓝色 3px 边框 + 浅蓝背景 |
| `NotificationList.astro` | 根据 `notification.read` 添加 unread 类                         |

#### 1.4.3 "全部标为已读"按钮

> ⚠️ 此功能需要 API（当前无），移至 Phase 2。

### 1.5 语义色扩充（tokens.css）

| 当前 11 个              | 新增 13 个               | 共计 24 个                      |
| ----------------------- | ------------------------ | ------------------------------- |
| `--color-primary`       | `--color-navbar-bg`      | 导航栏背景（可与 surface 不同） |
| `--color-primary-hover` | `--color-navbar-text`    | 导航栏文字色                    |
| `--color-bg`            | `--color-sidebar-bg`     | 侧栏背景                        |
| `--color-surface`       | `--color-sidebar-text`   | 侧栏文字色                      |
| `--color-text`          | `--color-sidebar-hover`  | 侧栏悬停态                      |
| `--color-muted`         | `--color-sidebar-active` | 侧栏激活态                      |
| `--color-border`        | `--color-card-border`    | 卡片边框（可略浅于通用 border） |
| `--color-card-bg`       | `--color-input-border`   | 输入框边框                      |
| `--color-success`       | `--color-input-focus`    | 输入框聚焦环                    |
| `--color-danger`        | `--color-tag-bg`         | 标签背景                        |
| `--color-danger-hover`  | `--color-tag-text`       | 标签文字                        |
|                         | `--color-overlay`        | 遮罩层背景                      |
|                         | `--color-link-visited`   | 已访问链接色                    |

**4 套主题都要同步补充对应值**（参考 UI分析报告.md #2.3 的色值建议）。

### 1.6 组件样式新增（components.css）

#### 1.6.1 Avatar 统一尺寸

```
.avatar-sm (32px)
.avatar-md (40px) — 默认
.avatar-lg (96px) — 用户主页
```

代码参考 UI方案.md #5.3。

#### 1.6.2 Badge（可见度/状态标签）

```
.badge (基础)
.badge-public     — 绿色
.badge-logged-in  — 蓝色
.badge-followers  — 橙色
.badge-private    — 红色
.badge-pinned     — 黄色左侧边框
```

#### 1.6.3 Skeleton 骨架屏

纯 CSS animation（参考 UI方案.md #5.3），在分页加载、搜索结果加载时显示。

#### 1.6.4 Modal 组件

纯 CSS（`display: flex` + `.modal-overlay` 遮罩），通过 Astro 模板内条件渲染控制显示。

#### 1.6.5 Divider 分割线

`.divider`（纯水平线）+ `.divider-label`（带文字）

### 1.7 帖子卡片改进

| 改动                                 | 文件                                |
| ------------------------------------ | ----------------------------------- |
| 置顶帖左侧黄色 3px 边框              | `PostCard.astro` + `components.css` |
| 可见度 badge 展示                    | `PostCard.astro`                    |
| 时间戳格式优化（1m前 / 2h前 / 3d前） | `PostCard.astro` 工具函数           |

**注意**：帖子数据中已有 `pinned`、`visibility` 字段，模板级即可使用。

### 1.8 用户主页美化

| 改动            | 文件                                        |
| --------------- | ------------------------------------------- |
| Banner 背景区   | `[username]/index.astro` + `components.css` |
| 头像放大至 96px | 同上                                        |
| 统计数据加粗    | 同上                                        |
| 资料卡布局调整  | 同上                                        |

**Banner 实现**：`background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))` — 纯 CSS。

### 1.9 认证页面增强

| 改动                   | 文件                                             |
| ---------------------- | ------------------------------------------------ |
| 品牌 logo + 站点名称   | `login.astro`、`register.astro`                  |
| 页面垂直居中           | `base.css` 已有 `.auth-layout`                   |
| 输入框 focus ring 增强 | 已有 ✅                                          |
| "忘记密码"链接占位     | 根据 `.env` 中 `RESET_PASSWORD_ENABLED` 条件显示 |

### 1.10 管理后台视觉改进

| 改动                               | 文件                    |
| ---------------------------------- | ----------------------- |
| 斑马纹表格（`tr:nth-child(even)`） | `admin.css`（已有部分） |
| 统计卡片趋势箭头 ↑↓                | `admin.css`             |
| 表格行 hover 效果                  | `admin.css`（已有）     |
| 移动端 sidebar CSS transform 动画  | `admin.css`             |

### 1.11 动效增强

| 动效                     | 实现                               | 文件             |
| ------------------------ | ---------------------------------- | ---------------- |
| Skeleton shimmer         | CSS `@keyframes skeleton-shimmer`  | `components.css` |
| 移动端 sidebar 滑入      | `transform: translateX(-100%) → 0` | `base.css`       |
| Modal 入场               | `opacity` + `scale(0.95→1)`        | `components.css` |
| Tab bar 切换指示器       | `border-bottom` transition         | `components.css` |
| `prefers-reduced-motion` | 全局禁用动效                       | `tokens.css`     |

```css
/* tokens.css 新增 */
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

### 1.12 无障碍改进

| 项                    | 改动                                                |
| --------------------- | --------------------------------------------------- |
| 通知项 ARIA label     | `aria-label="${type} ${user} 对你的帖子执行了操作"` |
| 图标按钮 aria-label   | 所有 `.btn-icon` 增加 `aria-label`                  |
| 头像 alt 文本         | `<img alt="${username} 的头像">`                    |
| Pagination aria-label | 上一页/下一页增加 `aria-label`                      |
| Toast role            | `role="alert"`                                      |
| 帖子列表 aria-live    | 动态加载区域 `aria-live="polite"`                   |
| 颜色对比度            | 检查 `.muted` 文字在 surface 背景上的对比度         |

### 1.13 性能感知优化

| 项             | 改动                                    |
| -------------- | --------------------------------------- |
| 图片懒加载     | 全局 `<img loading="lazy">`（查漏补缺） |
| 图片宽高比     | 容器设 `aspect-ratio` 防止 CLS          |
| 分页加载骨架屏 | "加载更多"点击后显示 skeleton           |

### 1.14 SEO 增强

| 项                  | 改动                            |
| ------------------- | ------------------------------- |
| 帖子详情页 JSON-LD  | `Article` schema — 模板级别注入 |
| 用户主页 JSON-LD    | `ProfilePage` schema            |
| 帖子详情页 og:image | 帖子首图或用户头像              |

---

## Phase 2 — 后续改进（需新功能/API/组件）

> 以下功能需要新增 API 端点、修改 API 响应、新增前端组件或引入 JS 交互，
> **不属于当前阶段的实施范围**，记录作为后续里程碑参考。

### 2.1 全局发布入口

| 依赖                               | 说明                                      |
| ---------------------------------- | ----------------------------------------- |
| 需要确保 PostEditor 在所有页面可用 | 当前仅在首页 `/` 渲染 PostEditor          |
| 需要 Astro 组件结构调整            | 将 PostEditor 提升到 Base.astro layout 中 |
| 需要浮动按钮触发                   | 桌面 navbar "发布"按钮 + 移动端 tab "＋"  |

**方案**：点击浮动按钮 → 页面内展开 Composer 组件（非跳转页面）。

### 2.2 搜索实时建议

| 依赖                                       | 说明                            |
| ------------------------------------------ | ------------------------------- |
| 需要新 API `GET /api/search/suggest?q=xxx` | 返回热门标签 + 用户建议         |
| 需要前端 debounce + 下拉面板               | 轻量 JS 或 fetch + CSS dropdown |

### 2.3 搜索排序与过滤

| 依赖                          | 说明         |
| ----------------------------- | ------------ | -------- | -------------- |
| 需要 API 支持 `?sort=relevant | latest       | popular` | 当前仅时间倒序 |
| 新增排序 UI                   | Tab 或按钮组 |

### 2.4 通知"全部标为已读"

| 依赖                                          | 说明         |
| --------------------------------------------- | ------------ |
| 需要新 API `POST /api/notifications/read-all` | 批量标记已读 |

### 2.5 Emoji 选择器

| 依赖                | 说明                               |
| ------------------- | ---------------------------------- |
| 纯前端组件          | 数据量极小（~200 emoji），无需后端 |
| 需集成到 PostEditor | 弹出面板 → 点击插入 emoji          |

### 2.6 拖拽/粘贴上传图片

| 依赖            | 说明                                             |
| --------------- | ------------------------------------------------ |
| PostEditor 增强 | `dragenter` / `dragover` / `drop` / `paste` 事件 |
| 上传进度指示    | 已有上传 API，需添加进度条 UI                    |

### 2.7 首次使用引导流

| 依赖             | 说明                                        |
| ---------------- | ------------------------------------------- |
| 需要用户状态追踪 | DB 字段 `user.firstRunStep` 或 localStorage |
| 推荐用户页面     | 注册后 → 关注推荐 → 发首条帖子              |

### 2.8 草稿功能

| 依赖                  | 说明                                       |
| --------------------- | ------------------------------------------ |
| localStorage 自动保存 | PostEditor 增加 `beforeunload` 保存 + 恢复 |
| 草稿列表页面          | `/drafts` 路由 + 草稿管理 API（可选）      |

### 2.9 图片 Lightbox

| 依赖         | 说明                               |
| ------------ | ---------------------------------- |
| 轻量 JS 组件 | 点击图片 → 全屏遮罩浏览 → 点击关闭 |
| 键盘支持     | ESC 关闭、← → 切换                 |

### 2.10 管理员批量操作

| 依赖       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| 需要新 API | `POST /api/admin/batch/lock`、`POST /api/admin/batch/delete` |
| 前端 UI    | Checkbox 选择 → 批量操作按钮                                 |

### 2.11 键盘快捷键

| 依赖               | 说明                                       |
| ------------------ | ------------------------------------------ |
| 全局 JS 监听       | `N` 新帖、`/` 搜索、`G+H` 首页、`G+N` 通知 |
| 需要显示快捷键提示 | 工具条或帮助弹窗                           |

### 2.12 强调色切换

| 依赖                        | 说明                            |
| --------------------------- | ------------------------------- |
| tokens.css 新增强调色变量集 | `[data-accent="blue"]` 等       |
| ThemeSwitcher 扩展          | 当前仅 4 主题，增加强调色子选择 |

### 2.13 帖子转发/收藏

| 依赖                 | 说明                           |
| -------------------- | ------------------------------ |
| 需要 DB schema + API | 新增 `boosts` / `bookmarks` 表 |
| 需要新 React islands | BoostButton, BookmarkButton    |

### 2.14 富文本编辑增强（@/# 自动补全）

| 依赖         | 说明                               |
| ------------ | ---------------------------------- |
| 提及自动补全 | 需要用户列表 API + textarea 内解析 |
| 话题标签补全 | 需要热门标签 API                   |

### 2.15 实时推送通知

| 依赖             | 说明                 |
| ---------------- | -------------------- |
| WebSocket 或 SSE | 需要后端推送基础设施 |
| 前端连接管理     | 断线重连、通知弹窗   |

---

## 实施顺序建议

### Phase 1 执行顺序（按文件分组，降低冲突）

```
Step 1: tokens.css 语义色扩充 + layout 变量
Step 2: base.css 两栏布局 + sidebar + bottom tab-bar + responsive
Step 3: Base.astro 模板重构（sidebar + tab-bar）
Step 4: components.css 新增组件（avatar/badge/skeleton/modal/divider/notification-icon）
Step 5: PostCard.astro / NotificationList.astro 样式增强
Step 6: 用户主页 / 认证页面 / 管理后台 美化
Step 7: 动效 + 无障碍 + SEO
Step 8: 验证（npm run dev + 浏览器检查）
```

### Phase 2 优先级排序

```
P1 — 全局发布入口 / 搜索实时建议 / 通知全部已读
P2 — Emoji 选择器 / 拖拽上传 / 键盘快捷键
P3 — 强调色切换 / 首次引导 / 草稿 / Lightbox
P4 — 批量操作 / 转发收藏 / 实时推送
```

---

## 验收标准

### Phase 1 验收

- [ ] 桌面端 1024px+ 显示左侧导航栏 + 640px 内容区
- [ ] 移动端 639px- 显示底部 tab bar
- [ ] 所有页面在三种断点下正常渲染（导航可用）
- [ ] 搜索框有图标 + 清除按钮，搜索结果关键词高亮
- [ ] 通知列表有类型图标 + 未读标识
- [ ] 24 个语义色变量 4 套主题齐备
- [ ] Skeleton / Modal / Badge / Divider CSS 组件可用
- [ ] 用户主页有 banner + 大头像
- [ ] 认证页面有品牌标识
- [ ] 管理后台表格斑马纹 + 统计箭头
- [ ] `prefers-reduced-motion` 生效
- [ ] 主要交互元素有 aria-label
- [ ] `npm run dev` 无错误
- [ ] `npm run build` 通过

### Phase 2 验收（各功能独立验收）

各功能完成时需测试：功能正常、不影响现有功能、回归测试通过。
