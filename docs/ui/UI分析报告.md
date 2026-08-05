# UI 对标分析报告 — MuTan 与主流微博平台的全面对比

> 本文档横向对比 6 个主流微博/社交平台（X/Twitter、Mastodon、Bluesky、Threads、Misskey、Pleroma/Akkoma）的 UI/UX 设计，覆盖主题系统、组件布局、信息发布、搜索、通知、无障碍等 12 个维度，并逐一映射到 MuTan 当前状态，给出可落地的改进建议。

---

## 一、调研平台概览

| 平台               | 类型             | 前端技术          | 特色                                  |
| ------------------ | ---------------- | ----------------- | ------------------------------------- |
| **X/Twitter**      | 中心化           | React             | 左侧导航栏、右侧趋势栏、三栏布局      |
| **Mastodon**       | 去中心化联邦     | React+Redux       | 单列/多列切换、高级模式、设计令牌系统 |
| **Bluesky**        | 去中心化 AT 协议 | React             | 极简设计、自定义 Feeds、干净信息层级  |
| **Threads**        | 中心化（Meta）   | React             | 纯文字卡片、宽松间距、多列桌面布局    |
| **Misskey**        | 去中心化联邦     | Vue.js            | 高度可定制主题、Widget 系统、丰富动效 |
| **Pleroma/Akkoma** | 去中心化联邦     | Vue.js/React      | 多前端可选、轻量化、聊天式界面        |
| **MuTan（当前）**  | 中心化           | Astro SSR + React | 单列 720px、4 套 CSS 主题、SSR 优先   |

---

## 二、主题系统与色彩方案对比

### 2.1 各平台的主题架构

#### X/Twitter

- 仅提供 **Light / Dark / Dim** 三种预设
- 支持 4 种强调色（蓝色/黄色/品红/橙色）
- 强调色只影响少数元素（链接、按钮）
- 实现方式：CSS 变量 + `data-*` 属性

#### Mastodon

- 明确定义的 **设计令牌系统**（design tokens）
- 颜色令牌命名按用途：`--color-primary`、`--color-surface-0`~`--color-surface-900`
- 支持自定义 CSS 覆盖
- 社区主题（如 TangerineUI）可深度自定义

#### Bluesky

- 仅 Light / Dark
- 极其克制的色彩系统（蓝白为主）
- 用户几乎不可自定义
- 颜色数量最少（约 15 个语义色）

#### Threads

- 仅 Light / Dark
- Instagram 品牌的紫/橙渐变
- 不可自定义
- 强调 content-first，配色中性

#### Misskey ⭐（**最灵活**）

- **完整的主题引擎**：用户可创建/分享主题
- 主题定义为 JSON5 对象，包含：
    - `base`: light 或 dark
    - `props`: 30+ 个语义色键
    - 支持函数式颜色操作：`:darken<10<@accent`、`:lighten<15<@panel`、`:alpha<0.5<@bg`
    - 支持颜色引用：`@accent`、`$main`
- 社区主题市场（一键安装）
- 色彩维度最丰富（面板/导航/输入框/页脚/链接/提及/标签各有独立颜色）

#### MuTan（当前）

- **4 套主题**（light/dark/eye-care/high-contrast）— 在同类项目中算丰富
- 11 个语义色变量 — 功能足够但比 Misskey 少 60%
- 使用 `color-mix()` 实现动态透明度 — 现代 CSS 方案
- 用户不能自定义主题
- 主题数据存储在数据库（`userSettings.theme`）

### 2.2 色彩系统对标分析

| 维度         | 行业最佳                | MuTan 状态         | 差距                            |
| ------------ | ----------------------- | ------------------ | ------------------------------- |
| 主题数量     | 2~3 预设 + 自定义       | 4 预设             | 数量够，缺自定义                |
| 语义色数量   | 25~40（Misskey 有 30+） | 11                 | 缺面板/导航/输入框/标签等独立色 |
| 颜色操作能力 | 明度/饱和度/透明度函数  | 只有 `color-mix()` | 无法精确控制                    |
| 强调色       | 4 种可选（X）           | 不可选             | 用户无选择权                    |
| 主题分享     | Misskey 支持一键安装    | 不支持             | 无社区生态                      |
| 暗色模式     | 5 年成熟经验            | 已有               | 质量合格                        |
| 高对比度     | 必备（WCAG）            | 已有               | 合格                            |

### 2.3 建议：色彩系统增强方案

**短期（Phase 1）：补充语义色变量**

```css
/* 当前 11 个 → 补充至 24 个 */
--color-navbar-bg       /* 导航栏背景（可与 surface 不同） */
--color-navbar-text     /* 导航栏文字 */
--color-sidebar-bg      /* 侧栏背景 */
--color-sidebar-text    /* 侧栏文字 */
--color-sidebar-hover   /* 侧栏悬停 */
--color-sidebar-active  /* 侧栏激活 */
--color-card-border     /* 卡片边框（可浅于通用 border） */
--color-input-border    /* 输入框边框 */
--color-input-focus     /* 输入框聚焦 */
--color-tag-bg          /* 标签背景 */
--color-tag-text        /* 标签文字 */
--color-link-visited    /* 已访问链接 */
--color-overlay         /* 遮罩层 */
```

**中期（Phase 2）：支持强调色切换**

```
用户可选择 4~6 种强调色（primary），每个强调色只需覆盖：
  --color-primary
  --color-primary-hover
  --color-primary-muted (color-mix 12%)
```

**长期（Phase 3）：用户自定义主题**

借鉴 Misskey 的 JSON5 主题格式，用户可导出/导入/分享主题配置。

---

## 三、页面布局对比

### 3.1 布局模式比较

| 平台           | 桌面断点 | 布局模式      | 内容区宽度 | 侧栏                |
| -------------- | -------- | ------------- | ---------- | ------------------- |
| **X/Twitter**  | >1280px  | 三栏          | ~600px     | 左 275px + 右 350px |
| **Mastodon**   | >1024px  | 单列/多列可选 | ~600px     | 高级模式多列        |
| **Bluesky**    | >1024px  | 三栏          | ~600px     | 左 240px + 右 300px |
| **Threads**    | >1024px  | 单列/多列可选 | ~580px     | 右侧列              |
| **Misskey**    | >900px   | 三栏/Widget   | ~600px     | 左右皆可            |
| **Pleroma-FE** | >768px   | 双栏聊天式    | ~640px     | 左侧                |
| **MuTan**      | —        | **单列**      | **720px**  | **无**              |

### 3.2 布局问题详细分析

**问题 1：720px 过宽**

- 行业最佳阅读宽度为 580~640px（X 约 600px，Bluesky 约 600px）
- 720px 导致长行文字阅读困难（英文约 15~~18 词/行，中文约 35~~40 字/行）
- **建议**：内容区收窄至 640px，剩余空间分配给侧栏或留白

**问题 2：无可导航侧栏**

- 所有主流平台都有左侧导航（首页/搜索/通知/个人资料/设置）
- 当前 MuTan 所有导航都在顶部 navbar，功能越多越拥挤
- **建议**：桌面端增加左侧导航栏（图标+文字），移动端改为底部 tab bar

**问题 3：信息密度不均**

- Timeline 帖子之间缺少视觉分隔（只有卡片 `margin-bottom`）
- 行业做法：卡片之间有明确分隔 + hover 效果
- **建议**：维持卡片设计，增加分隔线或间距加强

### 3.3 响应式策略对比

| 断点       | X        | Bluesky  | Threads  | Mastodon | Misskey  | MuTan（当前） |
| ---------- | -------- | -------- | -------- | -------- | -------- | ------------- |
| <480px     | 底部 Tab | 底部 Tab | 底部 Tab | 单列     | 底部 Tab | navbar 折叠   |
| 480~768px  | 底部 Tab | 底部 Tab | 底部 Tab | 单列     | 底部 Tab | navbar 折叠   |
| 768~1024px | 简化侧栏 | 简化侧栏 | 单列     | 单列     | 双栏     | 无变化        |
| >1024px    | 三栏     | 三栏     | 多列     | 单/多列  | 三栏     | 单列 720px    |

**MuTan 缺少**：

- 移动端底部 Tab bar（主流标配）
- 平板端自适应布局（1024px 以上和以下完全一样）
- Sidebar 收起/展开过渡动画

---

## 四、搜索功能对比

### 4.1 搜索入口

| 平台      | 入口位置                | 宽度       | 快捷键   | 搜索类型            |
| --------- | ----------------------- | ---------- | -------- | ------------------- |
| X         | 左侧导航栏 + 右侧趋势区 | 全宽       | `/`      | 全局搜索            |
| Mastodon  | 左栏顶部                | 占位       | —        | 帖子/用户/标签      |
| Bluesky   | 左侧导航栏              | 固定       | —        | 帖子/用户/Feeds     |
| Threads   | 顶部搜索图标            | 弹出全屏   | —        | 用户/帖子           |
| Misskey   | 导航栏                  | 弹出对话框 | `Ctrl+K` | 笔记/用户/文件/play |
| **MuTan** | **页面内 `/search`**    | **全宽**   | **—**    | **帖子/用户**       |

### 4.2 搜索体验对比

| 特性                | X              | Bluesky   | Threads   | Misskey   | MuTan        |
| ------------------- | -------------- | --------- | --------- | --------- | ------------ |
| 实时搜索建议        | ✅             | ✅        | ❌        | ✅        | ❌           |
| 搜索历史            | ✅             | ❌        | ❌        | ❌        | ❌           |
| 过滤器（时间/类型） | ✅             | ✅        | ✅        | 标签      | ❌           |
| 搜索结果排序        | 相关/最新/用户 | 相关/最新 | 相关/最新 | 相关/最新 | **时间倒序** |
| 自动补全 hashtag    | ✅             | ❌        | ✅        | ✅        | ❌           |
| 搜索高亮匹配词      | ✅             | ✅        | ✅        | ✅        | ❌           |
| 空搜索提示          | ✅             | ✅        | ✅        | ✅        | ❌           |

### 4.3 搜索改进建议

```
1. 搜索入口移至导航栏（并固定可见，而非独立页面）
   桌面：navbar 右侧搜索图标或输入框
   移动：navbar 搜索图标 → 弹出全屏搜索

2. 增加实时搜索建议（纯前端过滤，无需后端）
   输入时显示：最近搜索 / 热门标签 / 用户建议

3. 搜索结果增加高亮
   匹配关键词用 <mark> 标签包裹（后端渲染时处理）

4. 增加排序选项
   相关度（默认）/ 最新 / 最多点赞

5. 空搜索状态提供引导
   "试试搜索：'技术' '生活' '旅行'" 或显示热门标签
```

---

## 五、信息发布流程对比

### 5.1 发帖入口

| 平台      | 主要入口                            | 次要入口       | 快捷方式 |
| --------- | ----------------------------------- | -------------- | -------- |
| X         | 左侧导航"发布"按钮 + 首页顶部输入框 | 导航栏浮动按钮 | `N` 键   |
| Mastodon  | 首页顶部输入框（折叠/展开）         | —              | —        |
| Bluesky   | 底部浮动按钮                        | 导航栏按钮     | —        |
| Threads   | 底部 + 按钮                         | 导航栏图标     | —        |
| Misskey   | 底部浮动按钮                        | 全局快捷键     | `N` 键   |
| **MuTan** | **首页顶部 PostEditor**             | **—**          | **—**    |

### 5.2 发帖流程对比

| 特性         | X              | Mastodon                  | Bluesky       | Misskey                   | MuTan              |
| ------------ | -------------- | ------------------------- | ------------- | ------------------------- | ------------------ |
| 可见度控制   | 公开/仅关注者  | 公开/未列出/仅关注者/私信 | 公开/仅关注者 | 公开/仅首页/仅关注者/私信 | ✅ 7 级可见度      |
| 图片上传     | 拖拽/粘贴/选择 | 拖拽/粘贴/选择            | 选择          | 拖拽/粘贴/选择            | 选择（有上传按钮） |
| 字数统计     | 实时 + 进度条  | 实时                      | 实时          | 实时                      | ✅ 有              |
| 草稿保存     | ✅             | ❌                        | ✅（2026）    | ❌                        | ❌                 |
| 定时发布     | ✅（Premium）  | ❌                        | ❌            | ✅                        | ❌                 |
| Emoji 选择器 | ✅             | ✅                        | ❌            | ✅                        | ❌                 |
| 提及自动补全 | ✅             | ✅                        | ✅            | ✅                        | ❌                 |
| 话题标签补全 | ✅             | ✅                        | ❌            | ✅                        | ❌                 |
| 帖子编辑     | ✅（Premium）  | ❌                        | ❌            | ❌                        | ✅（有版本历史）   |
| 富文本格式   | ❌             | ⚠️（MFM）                 | ❌            | ✅（MFM）                 | ✅（Markdown）     |

### 5.3 发帖体验改进建议

```
1. 增加全局发布入口
   - 桌面：导航栏固定"发布"按钮
   - 移动：底部 Tab bar 中央 + 图标
   - 快捷键：Ctrl+N / N 键

2. 改进 PostEditor 交互
   - 支持拖拽/粘贴上传图片
   - 字数进度条（接近限制时变红色）
   - 添加 emoji 选择器（数据量小，可用纯前端方案）
   - 提及 @ 自动补全（前端过滤用户列表）

3. 增加草稿功能
   - 未完成内容的 localStorage 自动保存
   - 下次进入编辑器时恢复
```

---

## 六、通知系统对比

### 6.1 通知分类与展示

| 平台      | 分类方式             | 图标区分   | 未读标识           | 批量操作    | 通知过滤 |
| --------- | -------------------- | ---------- | ------------------ | ----------- | -------- |
| X         | 全部/验证/提及/      | ✅         | 蓝色圆点           | ✅ 全部已读 | ✅       |
| Mastodon  | 全部/提及/关注/转发/ | ✅         | 数字徽章           | ✅          | ✅       |
| Bluesky   | 全部/回复/提及/      | ✅         | 蓝点               | ❌          | ❌       |
| Misskey   | 分组 Tab             | ✅         | 数字+高亮          | ✅          | ✅       |
| **MuTan** | **无分类**           | **无图标** | **数字徽章（有）** | **❌**      | **❌**   |

### 6.2 通知改进建议

**核心改进**：通知类型需要图标区分 + 未读状态标识

```css
.notification-item {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing-3);
	padding: var(--spacing-3) var(--spacing-4);
	border-radius: var(--radius-md);
	transition: background var(--transition-fast);
}
.notification-item:hover {
	background: color-mix(in srgb, var(--color-text) 3%, transparent);
}
.notification-item-unread {
	background: color-mix(in srgb, var(--color-primary) 6%, transparent);
	border-left: 3px solid var(--color-primary);
}
.notification-icon {
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-full);
	flex-shrink: 0;
	font-size: 0.875rem;
}
.notification-icon-like {
	background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
.notification-icon-follow {
	background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.notification-icon-comment {
	background: color-mix(in srgb, var(--color-success) 12%, transparent);
}
```

---

## 七、无障碍设计分析

### 7.1 行业标准与现状

| WCAG 标准          | 要求                       | MuTan 状态                       | 优先级 |
| ------------------ | -------------------------- | -------------------------------- | ------ |
| 1.4.3 色彩对比度   | 文本 ≥ 4.5:1，大文本 ≥ 3:1 | 需验证（high-contrast 主题合格） | P1     |
| 1.4.1 色彩使用     | 信息不能仅靠颜色区分       | 通知无图标区分 ❌                | P1     |
| 2.1.1 键盘导航     | 所有功能可通过键盘操作     | 需验证                           | P1     |
| 2.4.4 链接用途     | 链接文本需有含义           | 需审计                           | P2     |
| 2.4.7 焦点可见     | 有可见的 focus 指示器      | ✅ 已有 focus ring               | 合格   |
| 4.1.2 ARIA 属性    | 交互组件需 ARIA 标注       | React islands 有 aria 属性       | 部分   |
| 1.1.1 图片替代文本 | 所有 img 需 alt            | 需审计用户头像等                 | P2     |
| 2.2.2 暂停/停止    | 移动内容可暂停             | 无自动滚动                       | 不适用 |

### 7.2 无障碍改进清单

```
高优先级：
1. 通知项增加 ARIA label（aria-label="xxx 赞了你的帖子"）
2. 所有图标按钮增加 aria-label
3. 确保 Tab 键导航顺序合理（检查 PostCard 的交互元素）
4. 颜色对比度审计（特别是 muted 文字 #64748b 在 #f8fafc 背景上）

中优先级：
5. 帖子内容区增加 heading 层级（h1/h2/h3）
6. 用户头像增加 alt="xxx 的头像"
7. Pagination 增加 aria-label
8. Toast 通知增加 role="alert"

低优先级：
9. 帖子列表增加 aria-live="polite" 区域（动态内容）
10. 键盘快捷键支持（N 新帖, / 搜索, G+H 首页）
```

---

## 八、动效与过渡对比

### 8.1 各平台动效风格

| 平台       | 动效风格             | 典型动效                   | 动效时长  |
| ---------- | -------------------- | -------------------------- | --------- |
| X          | 克制，减少不必要动效 | 展开/收起/点赞             | 150~200ms |
| Mastodon   | 中量                 | 列切换/加载/通知           | 200~300ms |
| Bluesky    | 极克制               | 点赞弹出/帖子出现          | 100~200ms |
| Threads    | 流畅平滑             | 卡片进入/页面过渡          | 200~300ms |
| Misskey ⭐ | **丰富，有特色**     | 音符特效/页面过渡/通知动画 | 200~500ms |
| **MuTan**  | **最少**             | **点赞 bounce**            | **400ms** |

### 8.2 MuTan 缺少的动效

```
1. 帖子进入动画（新加载的帖子从下方滑入）
2. 页面间过渡（当前 SSR 全页刷新，暂不可实现）
3. 通知条滑入（已有的 toast 可保留）
4. Sidebar 展开/收起
5. 点赞即时反馈（已有 bounce，可增强）
6. 发布成功后帖子插入动画
7. 评论折叠/展开
8. 图片加载时的渐进式过渡（blur-up 效果）
```

**原则：动效永远不阻塞交互，使用 `prefers-reduced-motion`**

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

---

## 九、MuTan 独有的优势（应保持）

| 优势          | 说明                   | 对比                          |
| ------------- | ---------------------- | ----------------------------- |
| 7 级可见度    | 比所有主流平台更细粒度 | X 仅 2 级，Mastodon 4 级      |
| 帖子版本历史  | 支持编辑后查看修订     | X 仅 Premium，Mastodon 不支持 |
| Markdown 渲染 | 支持富文本格式         | X 和 Bluesky 不支持           |
| 4 套主题      | 含护眼和高对比度       | 多数平台仅 light/dark         |
| Astro SSR     | 首屏加载快，SEO 友好   | 比纯 SPA 快                   |
| 管理后台完善  | 统计/用户管理/内容管理 | 同类项目少有如此完善的后台    |
| 响应式        | 移动端已有基础         | 虽然有但需加强                |

---

## 十、你可能没注意到的重要领域

### 10.1 加载状态与骨架屏

**现状**：MuTan 所有页面 SSR 渲染，首次加载无问题。但：

- 分页加载新帖子时无过渡（直接闪现）
- 图片加载时无占位
- 表单提交后无 loading 指示

**建议**：分页加载时顶部显示骨架屏（skeleton）

```css
.skeleton-post {
	padding: var(--spacing-4);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-lg);
	margin-bottom: var(--spacing-3);
}
.skeleton-line {
	height: 12px;
	background: var(--color-surface);
	border-radius: var(--radius-sm);
	margin-bottom: 8px;
	animation: skeleton-pulse 1.5s ease-in-out infinite;
}
.skeleton-line:last-child {
	width: 60%;
}
.skeleton-avatar {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	background: var(--color-surface);
	animation: skeleton-pulse 1.5s ease-in-out infinite;
}
@keyframes skeleton-pulse {
	0%,
	100% {
		opacity: 0.5;
	}
	50% {
		opacity: 1;
	}
}
```

### 10.2 空状态设计

**现状**：页面使用通用的 `.empty-state`，文案简单
**问题**：空状态是用户流失点，应提供下一步引导

**改进方向**：

- 无帖子的主页 → "关注一些用户，看看他们的动态！[发现用户]"
- 空的搜索 → "未找到相关内容。试试其他关键词，或浏览[热门标签]"
- 空的关注列表 → "你还没有关注任何人。发现有趣的人？[探索]"
- 空的草稿 → "保存的草稿会出现在这里"
- 404 页面 → "页面未找到。也许去了[首页]？"

### 10.3 错误处理与用户反馈

**现状**：

- 表单错误有红色提示文字
- 无全局错误处理边界
- API 失败时用户可能看不到反馈

**建议**：

- 全局错误 Boundary（Astro 原生支持 Error 页面）
- API 失败时自动显示 Toast 错误
- 表单提交按钮提交时 disabled + 显示 "提交中..."
- 网络断开时显示离线指示器（`navigator.onLine`）

### 10.4 用户引导与首次体验

**现状**：新用户注册后直接跳转到首页，无引导流程

**行业做法**：

- X：推荐关注列表
- Bluesky：Starter Packs（一键关注推荐用户）
- Threads：推荐热门帖子

**建议**：

- 注册成功后：推荐 5~10 个热门用户 → 显示一条欢迎帖子 → 引导发第一条帖
- 首次登录后的空首页：显示引导卡片
- 功能提示（Tooltip）：首次发帖、首次搜索时显示简短提示

### 10.5 性能感知优化

虽然 MuTan 是 SSR，但仍有一些感知优化可以做：

- **图片懒加载**：`loading="lazy"`（当前可能已有）
- **字体优化**：`font-display: swap`（防止 FOIT）
- **过渡动画**：页面间使用 `view-transition` API（Chrome 111+ 支持）
- **关键 CSS 内联**：首屏关键样式直接 `<style>` 内联（Astro 自动处理）
- **图片占位**：使用宽高比容器防止布局偏移（`aspect-ratio`）

### 10.6 SEO 与社交分享

**现状**：

- Base.astro 有 og:title, og:description, og:image
- 无结构化数据（JSON-LD）
- 帖子详情页无独立 og:image

**建议**：

- 帖子详情页增加 JSON-LD（`Article` schema）
- 用户主页增加 JSON-LD（`ProfilePage` schema）
- 帖子详情页 og:image 使用帖子首图或用户头像
- 规范 URL（已有 canonicalUrl 支持）

### 10.7 管理后台易被忽视的细节

| 细节       | 现状           | 建议                                       |
| ---------- | -------------- | ------------------------------------------ |
| 批量操作   | 无             | 多选用户/帖子 → 批量锁定/删除              |
| 确认弹窗   | 有             | 增加二次确认（"确定删除？此操作不可撤销"） |
| 数据导出   | 无             | CSV 导出用户/帖子列表                      |
| 搜索管理项 | 无             | 全局搜索管理员功能（Ctrl+K）               |
| 移动端优化 | 有 sidebar     | 表格列数减少，关键信息优先                 |
| 日志过滤   | 无             | 按类型/用户/时间过滤活动日志               |
| 审计痕迹   | 有 ActivityLog | 增加操作者 IP 记录                         |

---

## 十一、综合改进优先级矩阵

| 类别   | 改进项                 | 工作量 | 用户感知         | 优先级 |
| ------ | ---------------------- | ------ | ---------------- | ------ |
| 布局   | 内容区 720px → 640px   | 小     | 中               | P1     |
| 布局   | 左侧导航栏（桌面）     | 中     | 高               | P1     |
| 布局   | 底部 Tab bar（移动）   | 中     | 高               | P1     |
| 发布   | 全局发布入口           | 小     | 高               | P1     |
| 发布   | 拖拽/粘贴上传          | 小     | 中               | P2     |
| 发布   | Emoji 选择器           | 中     | 中               | P2     |
| 搜索   | 入口移至导航栏         | 小     | 高               | P1     |
| 搜索   | 实时建议               | 中     | 中               | P2     |
| 搜索   | 结果高亮               | 小     | 中               | P2     |
| 通知   | 图标区分类型           | 小     | 高               | P1     |
| 通知   | "全部已读"按钮         | 小     | 高               | P1     |
| 主题   | 补充语义色（11→24）    | 小     | 中               | P2     |
| 主题   | 强调色切换             | 中     | 中               | P3     |
| 动效   | 骨架屏                 | 小     | 高               | P1     |
| 动效   | 帖子进入动画           | 小     | 中               | P2     |
| 动效   | prefers-reduced-motion | 极小   | 低（但符合规范） | P2     |
| 无障碍 | 键盘导航审计           | 中     | 中               | P1     |
| 无障碍 | ARIA 属性补充          | 小     | 中               | P1     |
| 引导   | 首次使用引导流         | 中     | 高               | P2     |
| 空状态 | 改进空状态文案         | 小     | 中               | P2     |
| 后台   | 批量操作               | 中     | 中               | P3     |
| 后台   | 搜索过滤               | 小     | 中               | P3     |

---

## 十二、对标结论

### MuTan 的定位选择

与 6 个主流平台对比后，MuTan 的差异化定位应该是：

> **轻量、可控、隐私优先的微博系统，在功能完整性和视觉现代感之间取得平衡**

这意味着：

- **不做** Misskey 级别的自定义主题（维护成本过高）
- **不做** X 级别的算法推荐（复杂且不透明）
- **要做** 比 Mastodon 更好的第一个使用体验
- **要做** 比 Bluesky 更丰富的功能（可见度、Markdown、版本历史）
- **要保持** 敏捷的 SSR 性能和 SEO 优势

### 核心推荐

基于对标分析，按实施顺序推荐 5 个**最高性价比**改进：

1. **桌面两栏布局 + 左侧导航** — 这是视觉改观最大的单一改动，同时引入底部 Tab bar
2. **全局发布入口** — 降低发帖门槛，提升用户活跃度
3. **搜索 UX 增强** — 入口 + 高亮 + 建议，搜索是留存的关键功能
4. **通知系统视觉升级** — 图标 + 未读状态 + 分类，最容易被忽略的感知提升
5. **骨架屏 + 加载状态** — 高感知、低成本的性能感知优化

---

## 十三、参考来源

- Mastodon Design Tokens: `docs.joinmastodon.org/dev/frontend/design-tokens/`
- Misskey Theme System: `misskey-hub.net/en/docs/for-users/features/theme/`
- Misskey Customization (DeepWiki): `deepwiki.com/misskey-dev/misskey/6.5-customization-system`
- Mastodon Frontend Components (DeepWiki): `deepwiki.com/mastodon/mastodon/6.1-ui-components`
- TangerineUI for Mastodon: `github.com/nileane/TangerineUI-for-Mastodon`
- shadcn/ui design system: `ui.shadcn.com`
- PrimeVue Color System: `primevue.org/colors`
- Tailwind v4 Design Tokens Guide: `oneminutebranding.com/blog/tailwind-v4-design-tokens`
- WCAG 2.2 Accessibility Guidelines: `w3.org/TR/WCAG22/`
- Social Media Accessibility (Level Access): `levelaccess.com/blog/accessible-social-media`
- Search UX Best Practices (DesignRush 2026): `designrush.com/best-designs/websites/trends/search-ux-best-practices`
- Search UX Best Practices (Design Monks 2026): `designmonks.co/blog/search-ux-best-practices`
- UI Design Trends 2026 (Midrocket): `midrocket.com/en/guides/ui-design-trends-2026/`
- Threads Web Experience: `about.fb.com/news/2025/04/new-features-threads-web-experience`
- Bluesky 2026 Roadmap: `contentgrip.com/bluesky-2026-roadmap`
- Mastodon 2026 Roadmap: `fediview.com/articles/mastodon-2026-roadmap-new-features-creator-tools-onboarding`
