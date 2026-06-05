# UI 设计方案 — MuTan（睦谈）用户体验重构

> 基于行业主流的社交/微博平台（X/Twitter、Mastodon、Bluesky、Threads、Misskey）的界面模式分析，结合 MuTan 当前 CSS 架构（tokens.css + base.css + components.css + admin.css）和 Astro SSR 特性，提出可落地的 UI 改版方案。

---

## 一、现状问题总结

| 问题                                                | 影响                          | 严重度 |
| --------------------------------------------------- | ----------------------------- | ------ |
| 页面布局单一 — 所有页面使用 `.container` 单列 720px | 信息密度低，宽屏浪费          | P1     |
| 导航栏功能分组不清晰                                | 用户不知道哪里发帖、哪里搜    | P1     |
| 无发帖快捷入口（浮动按钮或固定发布框）              | 发帖步骤多，降低活跃          | P1     |
| 个人主页与 Timeline 视觉无区分                      | 品牌认知弱                    | P2     |
| 缺少过渡动画和微交互                                | 界面僵硬，缺少现代感          | P2     |
| 帖子卡片信息层级扁平                                | 标题/内容/时间/操作区分不明显 | P2     |
| 管理后台与前台视觉割裂                              | 管理员体验不一致              | P3     |
| 移动端适配粗糙                                      | 导航折叠后无过渡动画          | P3     |

---

## 二、设计原则

1. **内容优先** — 帖子是核心，UI 不抢内容的存在感
2. **渐进式增强** — 在不破坏现有 SSR 架构的前提下，用 CSS + 轻量 JS 实现交互提升
3. **一致性** — 所有页面遵循同一套设计语言（间距、圆角、色彩、动效）
4. **性能敏感** — 不引入运行时 CSS-in-JS，不增加 JS bundle 大小
5. **无障碍** — 色彩对比度、键盘导航、屏幕阅读器支持

---

## 三、布局系统

### 3.1 三层布局架构

```
┌─────────────────────────────────────────────────┐
│  Navbar (56px)                                   │
│  品牌 | 发布按钮 | 搜索 | 通知 | 用户菜单        │
├─────────────────────┬───────────────────────────┤
│                     │                           │
│   Sidebar (可选)     │   Main Content            │
│   · 首页             │   (flex: 1)               │
│   · 最新             │                           │
│   · 关注             │                           │
│   · 标签             │                           │
│   · 设置             │                           │
│                     │                           │
├─────────────────────┴───────────────────────────┤
│  Footer (简单版权信息)                           │
└─────────────────────────────────────────────────┘
```

### 3.2 响应式断点

| 断点              | 布局                | Sidebar        |
| ----------------- | ------------------- | -------------- |
| < 640px (手机)    | 单列，底部 tab 导航 | 隐藏，侧滑菜单 |
| 640~1024px (平板) | 单列 640px          | 折叠图标栏     |
| > 1024px (桌面)   | sidebar + main 两栏 | 展开 220px     |

### 3.3 路由 → 布局映射

```
/                    → 首页 Timeline（热门帖子，支持置顶）
/latest              → 最新时间线
/following           → 关注时间线（需登录）
/search?q=xxx        → 全局搜索结果
/@username           → 用户主页（个人信息 + 帖子列表）
/@username/:postId   → 帖子详情页
/@username/:postId/edit        → 编辑帖子
/@username/:postId/revisions   → 版本历史
/notifications       → 通知列表
/settings            → 个人设置
/tags/:tag           → 标签聚合页
/login               → 登录（独立布局）
/register            → 注册（独立布局）
/admin/*             → 管理后台（独立布局）
```

### 3.4 CSS 变量新增

```css
/* tokens.css 新增 */
--layout-sidebar-width: 220px;
--layout-sidebar-collapsed: 64px;
--layout-max-narrow: 640px;
--layout-max-wide: 960px;
--layout-gap: 1.5rem;
--navbar-z: 100;
--sidebar-z: 90;

/* 桌面端两栏容器 */
.timeline-layout {
	display: grid;
	grid-template-columns: var(--layout-sidebar-width) 1fr;
	gap: var(--layout-gap);
	max-width: var(--layout-max-wide);
	margin: 0 auto;
	padding: var(--spacing-4);
}

/* 宽屏自适应：内容区最大 640px */
.timeline-main {
	max-width: var(--layout-max-narrow);
	width: 100%;
}
```

---

## 四、页面设计方案

### 4.1 首页 Timeline（/）

**当前问题：** 单列 720px 流式布局，热门/最新无区分，置顶帖混在流中

**设计方案：**

```
┌──────────────────────────────────────────┐
│ [首页] [最新] [关注]   ← tab bar         │
├──────────────────────────────────────────┤
│ ┌─ 快捷发帖 (仅登录) ─────────────────┐  │
│ │ 📝 此刻想法...  [发布]  剩余 500字  │  │
│ └──────────────────────────────────────┘  │
│                                          │
│ ┌─ 帖子卡片 ──────────────────────────┐  │
│ │ avatar  昵称  @username · 3m前      │  │
│ │ ──────────────────────────────────  │  │
│ │ 帖子内容（render 后的 HTML）         │  │
│ │ ──────────────────────────────────  │  │
│ │ 💬 5  🔄 2  ❤️ 12  🔗              │  │
│ └──────────────────────────────────────┘  │
│ → 加载更多 (pagination 按钮)              │
└──────────────────────────────────────────┘
```

**关键改动：**

- Tab bar：首页（热门）| 最新 | 关注 — 替代独立页面跳转
- 发帖框固定在 timeline 顶部（展开式，类似 Mastodon）
- 帖子卡片增加转发（boosts）支持（后端未实现则隐藏按钮）
- 置顶帖用黄色左侧边框标识 `border-left: 3px solid var(--color-primary)`

### 4.2 用户主页（/@username）

**当前问题：** 用户信息与帖子列表在同一流中，资料区简陋

**设计方案：**

```
┌──────────────────────────────────────────┐
│ ┌─ 用户资料头（banner 区） ──────────┐  │
│ │                                      │  │
│ │  ┌────┐                              │  │
│ │  │头像 │  显示名称                     │  │
│ │  │96px│  @username                   │  │
│ │  └────┘  简介 bio text               │  │
│ │                                      │  │
│ │  帖子 142  关注 89  粉丝 1.2k        │  │
│ │              [关注/已关注] 按钮       │  │
│ └──────────────────────────────────────┘  │
│                                          │
│ ┌─ Tab: [帖子] [回复] [喜欢] ────────┐  │
│ │ 帖子列表 (同首页帖子卡片)           │  │
│ │ ...                                │  │
│ └──────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**关键改动：**

- Banner 区域背景色使用主题 primary 的浅色变体（`color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))`）
- 头像放大至 96px（桌面）/ 72px（移动），带环形边框 `border: 3px solid var(--color-card-bg)`
- 统计数字加粗、加大，可点击（跳转到 followers/following 页面）
- 增加 Tab bar：帖子 | 回复 | 喜欢（后端需补充对应的查询能力）

### 4.3 帖子详情页（/@username/:postId）

**当前问题：** 内容区过窄，评论区与帖子分离感强

**设计方案：**

```
┌──────────────────────────────────────────┐
│ ← 返回（链接回 timeline）                 │
│                                          │
│ ┌─ 帖子详情 ─────────────────────────┐  │
│ │ avatar  显示名  @username · 时间    │  │
│ │ 可见度标签 [公开/仅关注者]           │  │
│ │ ──────────────────────────────────  │  │
│ │ 完整内容（render 后的 HTML）         │  │
│ │ 图片媒体（grid 或 carousel）         │  │
│ │ ──────────────────────────────────  │  │
│ │ 💬 点赞 评论 分享  · 编辑 删除      │  │
│ └──────────────────────────────────────┘  │
│                                          │
│ ┌─ 评论区 ────────────────────────────┐  │
│ │ 评论输入框 (textarea + 发布按钮)     │  │
│ │ ──────────────────────────────────  │  │
│ │ 评论列表 (无限滚动)                  │  │
│ │ · avatar  昵称 · 2h前               │  │
│ │   评论内容                           │  │
│ │   ❤️ 3  [回复]                       │  │
│ └──────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**关键改动：**

- 帖子详情区与评论区视觉上连接（同色背景，border-radius 统一）
- 可见度标签化 `.visibility-badge`（小圆角 pill，不同颜色对应不同可见度）
- 图片浏览支持点击放大（Lightbox，纯 CSS 或轻量 JS）
- 评论区排序：默认最新，可切换最热

### 4.4 搜索页面（/search）

**当前问题：** 一个页面包含两个 tab，无搜索建议

**设计方案：**

- 搜索框置顶，带搜索图标和清除按钮
- 结果区域 Tab：帖子 | 用户，保持搜索关键词跨 tab
- 帖子结果与首页帖子卡片一致
- 用户结果显示为水平卡片（avatar + 昵称 + 简介 + 关注按钮）
- 空搜索时显示搜索技巧或热门标签

### 4.5 通知页面（/notifications）

**当前问题：** 纯文本列表，无图标区分通知类型

**设计方案：**

```
┌──────────────────────────────────────────┐
│ 通知                    [全部标为已读]   │
├──────────────────────────────────────────┤
│ ● [❤️] username 赞了你的帖子             │
│ ● [💬] username 回复了你                │
│ ● [👤] username 关注了你                │
│ ● [🔄] username 转发了你的帖子           │
│                                          │
│ (未读: 左侧蓝色点 ●，已读: 无点)         │
│ → 更多                                  │
└──────────────────────────────────────────┘
```

**关键改动：**

- 每种通知类型使用不同图标（emoji 或 SVG，无需额外依赖）
- 未读通知左侧蓝色小圆点标识
- 点击直接跳转到对应帖子详情页
- 顶部"全部标为已读"按钮

### 4.6 设置页面（/settings）

**当前问题：** 五个分区垂直堆叠，页面过长

**设计方案：**

- 左侧二级导航（桌面）：个人资料 | 账户安全 | 外观 | API Token | Webhook
- 右侧内容区仅显示当前选中分区
- 移动端：分区标题可点击折叠（accordion）
- 表单保存按钮固定底部（sticky）

### 4.7 认证页面（/login, /register）

**当前问题：** 已有卡片居中布局，风格偏简陋

**设计方案：**

- 居中卡片最大化宽度 400px，垂直居中（`min-height: 100vh`）
- 加入品牌标识（logo + 站点名称）
- 输入框 focus ring 更突出（已有改进，保留）
- 注册成功后的引导提示
- 增加"忘记密码"链接（占位，后端未实现则隐藏）

### 4.8 管理后台（/admin/\*）

**当前已相对完善**，重点改进：

- 增加二级页面导航（选中的 sidebar 链接高亮已有）
- 表格行 hover 效果 + 斑马纹
- 移动端 sidebar 动画使用 CSS transform 而非 display 切换
- 统计卡片增加趋势箭头（↑↓）

---

## 五、组件体系

### 5.1 现有组件梳理与改进

| 组件            | 现状                         | 改进方向                          |
| --------------- | ---------------------------- | --------------------------------- |
| `.navbar`       | 有 sticky + shadow           | 增加 secondary nav，搜索框集成    |
| `.card`         | border + shadow + hover 提升 | 维持，所有卡片统一                |
| `.btn` 系列     | 4 种变体                     | 增加 `.btn-sm` `.btn-lg` 尺寸变体 |
| `.form-input`   | focus ring 完整              | 增加 input group（前缀图标）      |
| `.pagination`   | 上一页/下一页                | 增加页码数字跳转                  |
| `.toast`        | 右下角弹出                   | 增加顶部居中变体                  |
| `.post-card`    | hover 微上升                 | 增加 pinned 状态, thread 连线     |
| `.user-card`    | flex 水平                    | 增加垂直变体（搜索结果）          |
| `.like-btn`     | bounce 动画                  | 增加点赞数即时更新动画            |
| `ThemeSwitcher` | 下拉菜单                     | 增加主题预览小色块                |

### 5.2 新增组件

| 组件名           | 用途                | CSS 类前缀                               |
| ---------------- | ------------------- | ---------------------------------------- |
| TabBar           | 页面内切换导航      | `.tab-bar`                               |
| FeedItem         | 时间线中的帖子      | 复用 `.post-card`                        |
| ProfileHeader    | 用户资料头部        | `.profile-header`                        |
| Composer         | 快捷发帖输入框      | `.composer`                              |
| NotificationItem | 通知列表项          | `.notification-item`                     |
| Avatar           | 统一头像组件        | `.avatar` + `.avatar-sm/md/lg`           |
| Badge            | 徽章（可见度/状态） | `.badge` + `.badge-public/logged-in/etc` |
| Skeleton         | 加载占位骨架屏      | `.skeleton`                              |
| Modal            | 通用弹窗            | `.modal-overlay` + `.modal`              |
| Divider          | 视觉分割线          | `.divider` + `.divider-label`            |
| Sidebar          | 桌面端侧边导航      | `.sidebar`                               |

### 5.3 关键组件代码示例

#### Avatar 统一组件

```css
/* components.css 新增 */
.avatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-full);
	object-fit: cover;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface));
	color: var(--color-primary);
	font-weight: 600;
	overflow: hidden;
}
.avatar-sm {
	width: 32px;
	height: 32px;
	font-size: 0.75rem;
}
.avatar-md {
	width: 40px;
	height: 40px;
	font-size: 0.875rem;
}
.avatar-lg {
	width: 96px;
	height: 96px;
	font-size: 1.5rem;
	border: 3px solid var(--color-card-bg);
}
```

#### TabBar 组件

```css
.tab-bar {
	display: flex;
	border-bottom: 2px solid var(--color-border);
	margin-bottom: var(--spacing-4);
	gap: 0;
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
}
.tab-item {
	padding: var(--spacing-2) var(--spacing-4);
	font-size: 0.875rem;
	font-weight: 500;
	color: var(--color-muted);
	cursor: pointer;
	border-bottom: 2px solid transparent;
	margin-bottom: -2px;
	transition:
		color var(--transition-fast),
		border-color var(--transition-fast);
	white-space: nowrap;
	background: none;
	border-top: none;
	border-left: none;
	border-right: none;
}
.tab-item:hover {
	color: var(--color-text);
}
.tab-item[aria-selected='true'] {
	color: var(--color-primary);
	border-bottom-color: var(--color-primary);
	font-weight: 600;
}
```

#### Skeleton 骨架屏

```css
.skeleton {
	background: linear-gradient(
		90deg,
		var(--color-surface) 25%,
		color-mix(in srgb, var(--color-surface) 60%, var(--color-border)) 50%,
		var(--color-surface) 75%
	);
	background-size: 200% 100%;
	animation: skeleton-shimmer 1.5s ease-in-out infinite;
	border-radius: var(--radius-sm);
}
@keyframes skeleton-shimmer {
	0% {
		background-position: 200% 0;
	}
	100% {
		background-position: -200% 0;
	}
}
```

---

## 六、动效与微交互

### 6.1 动效原则

- 持续时间：150ms（hover）/ 200ms（transition）/ 300ms（enter/leave）
- 缓动函数：`ease`（默认）/ `cubic-bezier(0.16, 1, 0.3, 1)`（弹性的进入）
- 无侵入：用户不感知动效的存在，动效只是增强

### 6.2 动效清单

| 场景                 | 动效                           | 实现方式                  |
| -------------------- | ------------------------------ | ------------------------- |
| 卡片 hover           | translateY(-2px) + shadow 增强 | CSS transition（已有）    |
| 按钮点击             | scale(0.97)                    | CSS transition（已有）    |
| 页面切换             | 无（SSR 天然全页刷新）         | —                         |
| 帖子加载             | skeleton 闪烁                  | CSS animation（新增）     |
| Toast 出现/消失      | 从右滑入 / 向右滑出            | CSS animation（已有）     |
| 点赞动画             | 心跳缩放                       | CSS animation（已有）     |
| 导航栏菜单（移动端） | 下滑展开                       | CSS transition max-height |
| Sidebar 展开/收起    | 平滑推移                       | CSS transform translateX  |
| Modal 出现           | 背景淡入 + 内容 scale 0.95→1   | CSS animation             |
| Tab 切换             | 无（SSR 重渲染）               | —                         |
| 表单错误             | 输入框抖动 + 边框变红          | CSS animation             |

---

## 七、视觉风格指南

### 7.1 色彩系统（沿用现有 4 套主题）

| 用途           | light          | dark    | eye-care   | high-contrast |
| -------------- | -------------- | ------- | ---------- | ------------- |
| 品牌色 primary | #4f46e5 indigo | #818cf8 | #6b8e4e 绿 | #ffff00 黄    |
| 背景 bg        | #fff           | #0f172a | #f5f0e8 米 | #000          |
| 表面 surface   | #f8fafc        | #1e293b | #ede8dc    | #1a1a1a       |
| 边框 border    | #e2e8f0        | #334155 | #d4cfc4    | #fff          |

**保持现有 tokens.css 不变**，只补充色调用法文档。

### 7.2 排版

| 元素                   | 字体大小  | 字重 | 行高 |
| ---------------------- | --------- | ---- | ---- |
| 页面标题 `.page-title` | 1.375rem  | 700  | 1.3  |
| 帖子内容               | 0.9375rem | 400  | 1.65 |
| 用户昵称               | 0.9375rem | 600  | 1.3  |
| 元信息（时间/用户名）  | 0.75rem   | 400  | 1.4  |
| 按钮文字               | 0.875rem  | 500  | 1.4  |
| 标签文字               | 0.75rem   | 500  | 1.3  |
| 统计数字               | 1.75rem   | 700  | 1.2  |

### 7.3 间距与圆角

- 卡片内边距：`var(--spacing-4)`（1rem / 16px）
- 卡片间距：`var(--spacing-3)`（0.75rem / 12px）
- 卡片圆角：`var(--radius-lg)`（12px）
- 按钮圆角：`var(--radius-sm)`（6px）
- 头像圆角：`var(--radius-full)`（圆形）
- Badge 圆角：`var(--radius-full)`（胶囊形）

### 7.4 图标系统

- **策略：纯文本 emoji + 内联 SVG**
- 不引入 icon 库（避免额外 JS 包）
- 常用交互图标（点赞/评论/转发/分享）使用内联 SVG（已在 components.css 中有 like-icon）
- 导航图标使用 emoji（已在 navbar-links 中使用文本图标）

---

## 八、实施路线

### Phase 1 — 布局重构（预计 2-3 天）

```
1. tokens.css 新增布局变量（sidebar-width, layout-max-wide, gap）
2. base.css 新增 .two-column-layout / .sidebar / .timeline-main
3. Base.astro 重构导航栏 — 添加桌面 sidebar
4. 首页 / 最新 / 关注 适配两栏布局
5. 移动端 sidebar 侧滑菜单 + 过渡动画
6. 验证：所有页面在三种断点下正常显示
```

### Phase 2 — 组件完善（预计 2 天）

```
1. components.css 新增 Avatar / Badge / TabBar / Skeleton / Divider / Modal
2. PostCard.astro 使用新 Avatar 组件
3. 用户主页 ProfileHeader 组件化
4. SearchBox 增加输入提示
5. 通知列表使用 NotificationItem 组件
```

### Phase 3 — 动效与微交互（预计 1 天）

```
1. Skeleton 骨架屏实现
2. Mobile sidebar 动画
3. Modal 入场/出场动画
4. 分页加载过渡状态
5. Scrollbar 美化（webkit）
```

### Phase 4 — 管理后台视觉对齐（预计 1 天）

```
1. 管理后台引入视觉微调（斑马纹表格、统计箭头）
2. 移动端 sidebar 动画改造
3. 后台操作确认弹窗使用统一 Modal
```

### Phase 5 — 打磨与验证（预计 1 天）

```
1. 跨浏览器测试（Chrome / Firefox / Safari / Edge）
2. 移动端真机测试
3. 无障碍检查（键盘导航、aria 属性、对比度）
4. 性能检查（CSS 文件大小、重排/重绘）
5. 回归测试：db:seed → 启动 → Puppeteer 脚本验证
```

---

## 九、与现有架构的兼容性

| 新功能      | 对现有代码的影响                             | 风险等级            |
| ----------- | -------------------------------------------- | ------------------- |
| 两栏布局    | 新增 `.timeline-layout` 类，页面追加 wrapper | 低 — 纯 CSS         |
| Avatar 组件 | Astro 组件替换分散的 `<img>`                 | 中 — 需逐个替换     |
| Tab bar     | 新增 CSS + Astro 组件                        | 低 — 不破坏现有逻辑 |
| Sidebar     | 新增 CSS + Base.astro 修改                   | 中 — 导航逻辑调整   |
| Skeleton    | 纯 CSS，无 JS                                | 低                  |
| Modal       | 纯 CSS + 数据属性控制                        | 低                  |
| 通知图标    | 仅 HTML 模板修改                             | 低                  |

**关键约束：** 所有 React islands（LikeButton, FollowButton, ThemeSwitcher 等）仍需使用全局 CSS 类。新增的 CSS 类必须维持 `is:global` 可访问。

---

## 十、设计参考来源

- **X/Twitter** — 左侧导航栏模式，发帖按钮醒目，内容区最大化
- **Mastodon** — 多列布局，可折叠发帖框，高级模式
- **Bluesky** — 极简设计，feeds 切换，干净的信息层级
- **Threads** — 纯文字卡片，宽松间距，底部 tab 导航
- **Misskey** — 小组件系统，高度可定制，widget 布局
- **Bento Grid** — 2026 UI 趋势：非对称模块化网格布局（参考：UI Design Trends 2026 — Midrocket, Landdding）

---

## 十一、未纳入本次方案的功能

以下功能属于产品功能扩展而非 UI 重构，建议在后续里程碑中评估：

- 帖子转发/引用（boosts / quotes）
- 帖子收藏（bookmarks）
- 富文本编辑（提及 @ + 话题 # 的自动补全）
- 实时推送（WebSocket / SSE 通知）
- 图片 Lightbox 浏览
- 个人主页封面图（banner image）
- 私信 / 群聊
- 管理后台数据可视化增强
