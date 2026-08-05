# 睦谈 UX 原型 (v3)

实施前请先阅读仓库根目录的 `DESIGN.md` 与本目录的 `IMPLEMENTATION.md`。两者定义 token、页面映射、组件边界、响应式和可访问性验收标准；本目录 HTML 用于视觉验收。

重新设计的 UX/HTML 原型，修复了断点、布局、导航、详情页区分等问题。

## 断点方案

采用 Bootstrap 5 移动优先断点 (min-width)：

| 断点 | 起点 | 容器宽度 |
| ---- | ---- | -------- |
| xs   | 0    | 100%     |
| sm   | 576  | 540px    |
| md   | 768  | 720px    |
| lg   | 992  | 960px    |
| xl   | 1200 | 1140px   |
| xxl  | 1400 | 1320px   |
| 超宽 | 1600 | 1480px   |

1080p (1920px) 显示器下容器为 1320px，不再拥挤。

## 主题

对齐项目 `src/styles/tokens.css`：light / dark / eye-care / high-contrast + 5 种强调色 (blue/green/orange/purple/rose)。

## 文件

| 文件                | 说明                                  |
| ------------------- | ------------------------------------- |
| `prototype.css`     | 全部样式（令牌、布局、组件）          |
| `prototype.js`      | 主题切换、用户菜单、Toast、点赞、Tabs |
| `index.html`        | 首页                                  |
| `weibo.html`        | 微博频道（三栏）                      |
| `forum.html`        | 论坛频道（主题列表+右栏）             |
| `blog.html`         | 博客频道（卡片网格+右栏）             |
| `weibo-detail.html` | 微博详情（短文+扁平评论）             |
| `forum-detail.html` | 论坛帖详情（长文+楼层回复）           |
| `blog-detail.html`  | 博客详情（长文+目录+评论）            |
| `profile.html`      | 个人主页                              |
| `user-center.html`  | 用户中心/设置                         |
| `admin.html`        | 管理后台仪表盘                        |
| `admin-posts.html`  | 帖子管理列表                          |

## 导航

还原项目 `Base.astro` 原始导航结构：左侧品牌、中部频道链接 (md+)、右侧操作区（搜索/主题/用户下拉菜单）。

用户下拉菜单项：个人主页 / 用户中心 / 通知(带 badge) / 管理后台 / 登出。

移动端底部 tab bar：首页 / 搜索 / 通知 / 我的。

## 详情页区分

- **微博详情**：短文本 + 扁平评论列表 (comment-item)
- **论坛帖详情**：标题型长文 + 楼层回复 (reply-list, #N 楼)
- **博客详情**：长文 + 目录侧栏 + 评论
