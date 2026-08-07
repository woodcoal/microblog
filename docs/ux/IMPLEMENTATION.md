# 睦谈 UX 实施说明

本说明对应 `DESIGN.md`、`src/styles/tokens.css` 及 `docs/ux/` 的最终确认原型。原型是视觉与交互验收基线；实施使用已有 Astro/CSS 架构，不将原型 HTML 直接作为生产代码复制。

## 页面与壳映射

| 壳         | 路由范围                             | 交付原型                                                                      | 实施要点                                       |
| ---------- | ------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| C 发现首页 | `/`                                  | `home-c.html`                                                                 | 引导型双栏；桌面搜索、主题、账户在顶栏右端。   |
| A 内容     | 微博、论坛、博客、搜索、通知、个人页 | `weibo-a.html`、`forum-a.html`、`blog-a.html`、`search-a.html` 等             | 内容列优先；频道差异由内容结构而不是换肤体现。 |
| A 详情     | 三频道详情                           | `weibo-detail-a.html`、`forum-detail-a.html`、`blog-detail-a.html`            | 微博为扁平评论，论坛为楼层，博客为目录与长文。 |
| A 账户     | 登录、注册、设置、关系               | `login-a.html`、`register-a.html`、`user-center-a.html`、`connections-a.html` | 表单专注，账户入口不复用完整频道导航。         |
| B 后台     | 仪表盘与内容管理                     | `admin-b.html`、`admin-content-b.html`                                        | 浅灰左轨、白色顶栏、表格工作区；不装饰化。     |

## 路由覆盖清单

| 样本                                                               | 已实施路由                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `home-c.html`                                                      | `/`                                                                                             |
| `weibo-a.html`                                                     | `/weibo`、`/latest`、`/tags/[tag]`、`/bookmarks`                                                |
| `forum-a.html`                                                     | `/forum`、`/forum/[slug]`                                                                       |
| `blog-a.html`                                                      | `/blog`、`/blog/[slug]`                                                                         |
| `search-a.html`、`notifications-a.html`                            | `/search`、`/notifications`                                                                     |
| `profile-a.html`                                                   | `/[username]`                                                                                   |
| `weibo-detail-a.html`、`forum-detail-a.html`、`blog-detail-a.html` | `/[username]/[postId]`（按帖子模式呈现）                                                        |
| `login-a.html`、`register-a.html`、`user-center-a.html`            | `/login`、`/register`、`/settings`                                                              |
| `connections-a.html`                                               | `/following`、`/followers`                                                                      |
| `blog-editor-a.html`                                               | `/blog/write`、`/[username]/[postId]/edit`、`/[username]/[postId]/revisions`                    |
| `admin-b.html`、`admin-content-b.html`                             | `/admin`、`/admin/posts`、`/admin/users`、`/admin/comments`、`/admin/tags`、`/admin/categories` |

上述路由均在实际 `.astro` 页面中建立了对应的内容边界和标题区域：账户页使用导语加表单双栏，频道页使用频道标题与内容流，详情页按 `post.mode` 落到微博、论坛、博客的阅读面，后台每个工作区均有独立的运营标题区。共享 CSS 仅负责令牌、响应式和视觉层级，不替代页面结构。

## 实施顺序

1. 先让 `Base.astro` 和共享样式消费 `src/styles/tokens.css`；保留 light / dark / eye-care / high-contrast 与现有强调色覆盖。
2. 提取共享组件：`TopNav`、`AccountMenu`、`ThemeSelect`、`BottomNav`、`ContentShell`、`AdminShell`、`StatusBadge`。
3. 先落地 A 内容壳和详情结构，再接入账户表单、写作编辑和 B 后台表格。
4. 将原型中的示例文案替换为真实数据；不把 `alert`、`contenteditable` 原型交互直接投入生产。

## 组件契约

- `TopNav`：桌面按「品牌 / 频道 / 搜索 / 主题 / 通知 / 头像」排列；头像必须为最后元素。移动端隐藏频道文字，保留右侧账户入口。
- `ChannelShell`：列表、搜索和通知共用的响应式壳。仅有 mobile `<768px`、tablet `768–1023px`、desktop `≥1024px` 三档；页面用 `three-column`、`nav-main`、`main-aside` 或 `single` 声明语义，不能复制频道网格。主列最宽 760px，搜索/通知的 `single` 最宽 1024px；tablet 为 100px 图标导航轨，desktop 为 200px，300px 右栏仅在实际有内容且不压缩阅读列时显示。
- `FormField`：`label` 与输入控件关联；提交后呈现字段级错误；不只依赖 placeholder。
- `AdminTable`：宽数据表允许自身横向滚动；页面根节点不能产生横向溢出；批量操作需要选中数量与二次确认。
- `ThemeSelect`：写入现有主题属性值（`light`、`dark`、`eye-care`、`high-contrast`），而非原型的简化别名。

## 响应式与可访问性验收

- 在 375 / 767 / 768 / 1023 / 1024 / 1499 / 1500 / 1600px 检查根节点 `scrollWidth <= clientWidth`，并确认没有重复导航或断点跳变。
- 顶部头像的右边界距视口不大于 24px；键盘 Tab 可进入主题、通知、头像和所有表单控件。
- 关键文本与按钮满足 WCAG 2.2 AA；危险/成功状态同时使用文字，不能只依赖颜色。
- 所有图片提供替代文本；图标按钮必须有 `aria-label`；动效遵从 `prefers-reduced-motion`。

## 原型审阅入口

确认首页、三频道、详情和后台首页时以 `final-review.html` 为冻结基线。后续补充页以同目录的 `*-a.html` 与 `*-b.html` 为准；视觉方向探索文件不作为生产验收依据。
