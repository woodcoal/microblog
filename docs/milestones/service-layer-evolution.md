# Service 层架构演进里程碑

## 三层架构规范

### 架构总览

```
前端组件 ──→ Actions（薄适配：鉴权 + zod 校验 + 委托 service）
外部客户端 ──→ API 路由（薄适配：鉴权 + 格式转换 + 委托 service）
                    │
              Service 层（业务编排：协调 lib 原子能力）
                    │
              Lib 层（原子能力：DB / 通知 / 文件 / 推荐引擎 ...）
```

### 各层职责与约束

#### Actions 层（`src/actions/`）

**职责**：薄适配层，连接前端组件与 Service 层。

| 允许                            | 禁止                                           |
| ------------------------------- | ---------------------------------------------- |
| 鉴权（`getUserFromRequest`）    | 直接调用 `prisma`                              |
| Zod 输入校验                    | 直接调用 `@/lib/db`                            |
| 委托 Service 层函数             | 跨层调用 `@/lib/*`（auth/errors 除外）         |
| ServiceError → ActionError 转换 | 包含业务逻辑（校验规则、数据转换、副作用触发） |

**典型 handler 结构**（≤15 行）：

```typescript
export const xxxAction = defineAction({
	input: z.object({ ... }),
	handler: async (input, context) => {
		const currentUser = await getUserFromRequest(context);
		if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });
		try {
			return await xxxService({ userId: currentUser.userId, ...input });
		} catch (e) {
			if (e instanceof ServiceError) throw new ActionError({ code: e.code, message: e.message });
			throw e;
		}
	}
});
```

**允许的 lib 导入**（仅限适配层自身职责）：

- `@/lib/auth` — 鉴权（getUserFromRequest、generateToken、setTokenCookie、clearTokenCookie）
- `@/lib/errors` — ServiceError 类

#### API 层（`src/pages/api/`）

**职责**：薄适配层，连接外部客户端与 Service 层。

| 允许                                       | 禁止                                               |
| ------------------------------------------ | -------------------------------------------------- |
| 鉴权（Agent Token / JWT / Cookie）         | 直接调用 `prisma`                                  |
| 请求格式解析（JSON / FormData / URL 参数） | 直接调用 `@/lib/db`                                |
| 委托 Service 层函数                        | 跨层调用 `@/lib/*`（agent/utils/errors/auth 除外） |
| ServiceError → HTTP 错误响应转换           | 包含业务逻辑                                       |
| 响应格式化（JSON / 纯文本）                |                                                    |

**允许的 lib 导入**（仅限适配层自身职责）：

- `@/lib/agent` — Agent API 鉴权与响应工具（requireAgentAuth、textResponse、textErrorResponse、parsePagination、getFollowIds、formatPostListItem、formatPostDetail）
- `@/lib/utils` — 通用工具（parseJsonBody）
- `@/lib/errors` — ServiceError 类
- `@/lib/auth` — 鉴权

#### Service 层（`src/services/`）

**职责**：业务编排层，协调 lib 层的原子能力，实现完整业务流程。

| 允许                                       | 禁止                                               |
| ------------------------------------------ | -------------------------------------------------- |
| 调用任意 `@/lib/*` 函数                    | 直接调用 `prisma`（通过 lib 层间接操作）           |
| 调用其他 Service 函数                      | 依赖 Astro 上下文（APIContext / ActionAPIContext） |
| 业务校验（字段合法性、权限检查、状态判断） | 接收 zod schema 作为参数                           |
| 触发副作用（通知、活动日志、推荐引擎同步） |                                                    |
| 抛出 ServiceError                          |                                                    |

**编码规范**：

- 函数不依赖 Astro 上下文，仅接收纯参数，返回纯数据
- 输入输出使用显式 TypeScript 接口，不用 zod
- 异步副作用（通知、活动日志、推荐引擎）在 service 内部触发，调用方无需关心
- 抛出业务错误使用 ServiceError，由 Action/API 层转换为各自的错误格式

#### Lib 层（`src/lib/`）

**职责**：原子能力层，提供可复用的底层操作。

| 允许                                    | 禁止                                       |
| --------------------------------------- | ------------------------------------------ |
| 直接调用 `prisma`（数据库 CRUD）        | 包含业务逻辑（校验规则、权限判断、状态机） |
| 封装数据库事务（`prisma.$transaction`） | 调用 Service 层函数（反向依赖）            |
| 提供纯工具函数（哈希、解析、格式化）    | 依赖 Astro 上下文                          |
| 触发 Webhook 等基础设施操作             |                                            |

**文件组织**（按实体/领域划分）：

| 文件              | 职责                         |
| ----------------- | ---------------------------- |
| `db.ts`           | Prisma Client 单例           |
| `user.ts`         | 用户 CRUD                    |
| `post.ts`         | 帖子 CRUD + 事务             |
| `comment.ts`      | 评论 CRUD                    |
| `social.ts`       | 点赞/关注/收藏 CRUD          |
| `category.ts`     | 分类 CRUD + 排序事务         |
| `tag.ts`          | 标签查询                     |
| `settings.ts`     | 用户设置 CRUD                |
| `notification.ts` | 通知创建/查询/删除           |
| `upload.ts`       | 文件存储 CRUD                |
| `activity.ts`     | 活动日志创建                 |
| `auth.ts`         | 鉴权工具（密码、JWT、Token） |
| `token.ts`        | API Token 生成/哈希/CRUD     |
| `webhook.ts`      | Webhook 触发/CRUD            |
| `visibility.ts`   | 可见度过滤                   |
| `errors.ts`       | ServiceError 类              |

### 层间依赖规则

```
Actions ──→ Services ──→ Lib ──→ Prisma
   │                         │
   │    API ──→ Services ──→ Lib ──→ Prisma
   │                         │
   └── 仅 auth/errors ───────┘
```

**严格规则**：

1. **单向依赖**：上层只能调用下层，禁止反向依赖
2. **禁止跨层**：Actions/API 不能直接调用 Lib（auth/errors/agent/utils 除外）
3. **Service 是唯一业务入口**：所有业务操作必须通过 Service 层，Actions/API 只做薄适配
4. **Lib 是唯一数据入口**：所有数据库操作必须通过 Lib 层，Service 不直接使用 prisma

### 违规示例与修正

#### 违规：Service 直接使用 prisma

```typescript
// ❌ services/content.service.ts
import { prisma } from '@/lib/db';
const post = await prisma.post.findUnique({ where: { id } });
```

```typescript
// ✅ services/content.service.ts
import { findPostById } from '@/lib/post';
const post = await findPostById(id);
```

#### 违规：Actions 跨层调用 Lib

```typescript
// ❌ actions/content.ts
import { createNotification } from '@/lib/notification';
import { logActivity } from '@/lib/activity';
```

```typescript
// ✅ actions/content.ts
import { createPost } from '@/services/content.service';
// 通知和活动日志由 service 内部触发
```

#### 违规：API 直接操作数据库

```typescript
// ❌ api/agent/users/index.ts
import { prisma } from '@/lib/db';
const users = await prisma.user.findMany({ ... });
```

```typescript
// ✅ api/agent/users/index.ts
import { getAgentUsers } from '@/services/user.service';
const result = await getAgentUsers({ ... });
```

---

## 目标

将当前 Actions 与 API 路由中重复的业务逻辑提取到 Service 层，实现：

```
前端组件 ──→ Actions（薄适配：鉴权 + zod 校验 + 委托 service）
外部客户端 ──→ API 路由（薄适配：鉴权 + 格式转换 + 委托 service）
                    │
              Service 层（业务编排：协调 lib 原子能力）
                    │
              Lib 层（原子能力：DB / 通知 / 文件 / 推荐引擎 ...）
```

## 重复现状

| 功能     | 重复度 | 当前位置                                                       |
| -------- | ------ | -------------------------------------------------------------- |
| 注册     | 85%    | `actions/auth.ts` vs `api/agent/register.ts`                   |
| 评论     | 90%    | `actions/content.ts` vs `api/agent/comments.ts`                |
| 个人资料 | 90%    | `actions/settings.ts` vs `api/agent/profile.ts`                |
| 文件上传 | 95%    | `actions/media.ts` vs `api/upload.ts` vs `api/agent/upload.ts` |
| 发帖     | 70%    | `actions/content.ts` vs `api/agent/posts/index.ts`             |
| 关注     | 70%    | `actions/social.ts` vs `api/agent/follows.ts`                  |
| 点赞     | 65%    | `actions/social.ts` vs `api/agent/likes.ts`                    |
| 登录     | 60%    | `actions/auth.ts` vs `api/agent/login.ts`                      |
| 通知列表 | 40%    | `actions/notifications.ts` vs `api/agent/notifications.ts`     |

---

## M1：建立 Service 层基础

> 目标：创建目录结构、定义编码规范、完成一个示例模块验证架构可行性。

### 1.1 创建目录结构

```
src/
  services/           ← 新增
    index.ts           ← 统一导出（可选）
    auth.service.ts
    social.service.ts
    content.service.ts
    media.service.ts
    search.service.ts
    config.service.ts
    webhook.service.ts
    token.service.ts
    category.service.ts
    notification.service.ts
```

### 1.2 定义 Service 编码规范

每个 service 文件遵循以下模式：

```typescript
// src/services/social.service.ts

/**
 * 社交互动 Service
 *
 * 编排点赞、关注、收藏的业务流程。
 * 不依赖 Astro 上下文，仅接收纯参数，返回纯数据。
 */

// ── 类型定义 ──

export interface ToggleLikeInput {
	userId: string;
	targetId: string;
	type: 'post' | 'comment';
}

export interface ToggleLikeResult {
	liked: boolean;
	likeCount: number;
}

// ── 业务函数 ──

export async function toggleLike(input: ToggleLikeInput): Promise<ToggleLikeResult> {
	const { userId, targetId, type } = input;

	// 1. 检查目标存在且未删除
	// 2. 查询当前状态
	// 3. 执行切换操作
	// 4. 异步副作用（通知、活动日志、Gorse）
	// 5. 统计并返回
}
```

**规范要点**：

- Service 函数**不依赖 Astro 上下文**（不接收 `APIContext` / `ActionAPIContext`）
- 输入输出使用**显式 TypeScript 接口**，不用 zod（zod 留在 Action 层做校验）
- Service 可以调用 lib 层的任何函数
- Service 之间可以互相调用（如发帖 service 调用搜索 service 更新索引）
- 异步副作用（通知、活动日志、Gorse）在 service 内部触发，调用方无需关心
- Service 函数**抛出业务错误**（用自定义 ServiceError 或直接 throw），由 Action/API 层转换为各自的错误格式

### 1.3 定义 ServiceError

```typescript
// src/lib/errors.ts

export class ServiceError extends Error {
	constructor(
		public code: 'NOT_FOUND' | 'BAD_REQUEST' | 'FORBIDDEN' | 'UNAUTHORIZED',
		message: string
	) {
		super(message);
		this.name = 'ServiceError';
	}
}
```

Action 层转换：

```typescript
try {
  return await toggleLikeService({ ... });
} catch (e) {
  if (e instanceof ServiceError) {
    throw new ActionError({ code: e.code, message: e.message });
  }
  throw e;
}
```

API 层转换：

```typescript
try {
  const result = await toggleLikeService({ ... });
  return textResponse(JSON.stringify(result));
} catch (e) {
  if (e instanceof ServiceError) {
    return textErrorResponse(e.message, statusCodeMap[e.code]);
  }
  return textErrorResponse('服务器错误', 500);
}
```

### 1.4 验证示例：提取 social service

选择 `toggleLike` 作为第一个验证目标（重复度 65%，逻辑清晰）：

1. 创建 `src/services/social.service.ts`
2. 从 `src/actions/social.ts` 的 `toggleLike` handler 中提取业务逻辑到 service
3. Action 改为：鉴权 → zod 校验 → 调用 service → 转换错误
4. `src/pages/api/agent/likes.ts` 改为：鉴权 → 调用 service → 格式转换
5. 构建验证 + 手动测试

**完成标准**：

- `astro build` 通过
- 点赞/取消点赞功能正常（前端 + Agent API）
- Service 函数无 Astro 依赖

---

## M2：提取高重复度 Service

> 目标：处理重复度 ≥ 85% 的模块，这些是收益最大的部分。

### 2.1 提取 auth.service.ts（注册 85%、登录 60%）

**从 `actions/auth.ts` 提取**：

| Service 函数          | 来源 Action     | 来源 API                |
| --------------------- | --------------- | ----------------------- |
| `registerUser(input)` | `auth.register` | `api/agent/register.ts` |
| `loginUser(input)`    | `auth.login`    | `api/agent/login.ts`    |
| `logoutUser(input)`   | `auth.logout`   | 无                      |

**提取要点**：

- `registerUser`：校验逻辑（注册开关、邮箱格式、用户名格式、保留词、密码长度、查重）+ 哈希密码 + 创建用户。返回创建的用户对象，JWT/API Token 生成由调用方决定
- `loginUser`：查用户 + dummyHash 防时序 + 校验密码 + 检查禁用。返回用户信息，JWT 生成和 cookie 设置由调用方决定
- Agent API 的注册额外创建 API Token，可在 service 返回用户后由 API 层自行处理

**调整需求**：

- `src/actions/auth.ts`：handler 改为 鉴权/无需鉴权 → zod 校验 → 调用 service → 生成 JWT/设 cookie
- `src/pages/api/agent/register.ts`：改为 调用 service → 额外创建 API Token → 返回纯文本
- `src/pages/api/agent/login.ts`：改为 调用 service → 返回纯文本提示

### 2.2 提取 content.service.ts — 评论部分（重复度 90%）

**从 `actions/content.ts` 提取**：

| Service 函数           | 来源 Action             | 来源 API                |
| ---------------------- | ----------------------- | ----------------------- |
| `createComment(input)` | `content.createComment` | `api/agent/comments.ts` |

**提取要点**：

- `createComment`：校验帖子存在/未删/未锁 → 校验内容 → 校验 parentId → 创建评论 → 异步通知+活动日志+Gorse
- Agent API 和 Action 的校验逻辑几乎一字不差，直接提取

**调整需求**：

- `src/actions/content.ts`：`createComment` handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/agent/comments.ts`：改为 鉴权 → 调用 service → 返回纯文本

### 2.3 提取 settings.service.ts — 个人资料部分（重复度 90%）

**从 `actions/settings.ts` 提取**：

| Service 函数           | 来源 Action              | 来源 API               |
| ---------------------- | ------------------------ | ---------------------- |
| `updateProfile(input)` | `settings.updateProfile` | `api/agent/profile.ts` |

**提取要点**：

- `updateProfile`：校验 displayName/bio/avatarUrl → 构建 updateData → prisma.user.update
- Agent API 不支持 note 字段，service 函数的 note 参数设为 optional，API 层不传即可

**调整需求**：

- `src/actions/settings.ts`：`updateProfile` handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/agent/profile.ts`：改为 鉴权 → 调用 service（不传 note）→ 返回纯文本

### 2.4 提取 media.service.ts（重复度 95%）

**从 `actions/media.ts` 提取**：

| Service 函数        | 来源 Action         | 来源 API                                |
| ------------------- | ------------------- | --------------------------------------- |
| `uploadFile(input)` | `media.uploadMedia` | `api/upload.ts` + `api/agent/upload.ts` |

**提取要点**：

- `uploadFile`：接收 File 对象 + fileType → 调用 saveFile → 返回文件信息
- 三处上传逻辑几乎完全相同，统一到 service 后消除最大重复

**调整需求**：

- `src/actions/media.ts`：handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/upload.ts`：改为 鉴权 → 调用 service → JSON 响应
- `src/pages/api/agent/upload.ts`：改为 鉴权 → 调用 service → 纯文本响应

**完成标准**：

- 所有修改的模块 `astro build` 通过
- 注册/登录/评论/个人资料/文件上传功能正常（前端 + Agent API）
- 每个 service 函数有明确的输入输出接口定义

---

## M3：提取中等重复度 Service

> 目标：处理重复度 65%-85% 的模块，补全核心业务 service。

### 3.1 补全 content.service.ts — 帖子部分（重复度 70%）

| Service 函数        | 来源 Action          | 来源 API                   |
| ------------------- | -------------------- | -------------------------- |
| `createPost(input)` | `content.createPost` | `api/agent/posts/index.ts` |
| `updatePost(input)` | `content.updatePost` | 无                         |
| `deletePost(input)` | `content.deletePost` | 无                         |

**提取要点**：

- `createPost`：校验 mode/title/categoryId → 校验可见度 → 校验 mediaIds → 生成短链 ID → 事务创建帖子+Media+Mention+PostTag → 异步通知+活动日志+Gorse
- Agent API 的发帖用 images URL 反查 FileStorage，service 需要支持两种输入方式（mediaIds 和 imageUrls）
- Agent API 不支持 password/users 可见度，service 统一支持，API 层做限制
- `updatePost` 和 `deletePost` 仅 Action 使用，但提取后方便未来 API 扩展

**调整需求**：

- `src/actions/content.ts`：三个帖子 handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/agent/posts/index.ts`：POST 改为 鉴权 → 参数转换 → 调用 service → 纯文本响应

### 3.2 补全 social.service.ts（关注 70%、点赞 65%）

| Service 函数            | 来源 Action             | 来源 API               |
| ----------------------- | ----------------------- | ---------------------- |
| `toggleFollow(input)`   | `social.toggleFollow`   | `api/agent/follows.ts` |
| `toggleBookmark(input)` | `social.toggleBookmark` | 无                     |

**提取要点**：

- `toggleFollow`：Agent API 用显式 action(follow/unfollow)，Action 用 toggle 模式。Service 统一为 toggle 模式，API 层在调用前将 action 转换为当前状态查询
- `toggleBookmark`：仅 Action 使用，提取后方便未来 API 扩展

**调整需求**：

- `src/actions/social.ts`：handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/agent/follows.ts`：改为 鉴权 → 查询当前状态 → 调用 service → 纯文本响应
- `src/pages/api/agent/likes.ts`：M1 已完成

### 3.3 提取 notification.service.ts（重复度 40%）

| Service 函数              | 来源 Action                      | 来源 API                     |
| ------------------------- | -------------------------------- | ---------------------------- |
| `getNotifications(input)` | `notifications.getNotifications` | `api/agent/notifications.ts` |

**提取要点**：

- 重复度较低（40%），因为分页方式（游标 vs page/limit）和过滤参数差异大
- Service 提供核心查询构建逻辑，分页和过滤参数由调用方自行组装
- 或者提供两个函数：`getNotificationsByCursor` 和 `getNotificationsByPage`

**调整需求**：

- `src/actions/notifications.ts`：handler 改为 鉴权 → zod 校验 → 调用 service
- `src/pages/api/agent/notifications.ts`：改为 鉴权 → 调用 service → 纯文本格式化

**完成标准**：

- 所有核心业务（帖子 CRUD、社交互动、通知）均有 service 层
- Agent API 全部改为调用 service
- `astro build` 通过

---

## M4：补全剩余 Service + Actions 薄化

> 目标：为所有 Action 提供 service 层，使 Action handler 仅剩鉴权+校验+委托。

### 4.1 提取 search.service.ts

| Service 函数           | 来源 Action            |
| ---------------------- | ---------------------- |
| `searchUsers(input)`   | `search.searchUsers`   |
| `searchSuggest(input)` | `search.searchSuggest` |

### 4.2 提取 config.service.ts

| Service 函数         | 来源 Action          |
| -------------------- | -------------------- |
| `updateTheme(input)` | `config.updateTheme` |

### 4.3 提取 webhook.service.ts

| Service 函数                 | 来源 Action                   |
| ---------------------------- | ----------------------------- |
| `createWebhook(input)`       | `webhook.createWebhook`       |
| `updateWebhook(input)`       | `webhook.updateWebhook`       |
| `deleteWebhook(input)`       | `webhook.deleteWebhook`       |
| `revealWebhookSecret(input)` | `webhook.revealWebhookSecret` |

### 4.4 提取 token.service.ts

| Service 函数            | 来源 Action         |
| ----------------------- | ------------------- |
| `createApiToken(input)` | `token.createToken` |
| `revokeApiToken(input)` | `token.revokeToken` |

### 4.5 提取 category.service.ts

| Service 函数               | 来源 Action                  |
| -------------------------- | ---------------------------- |
| `createCategory(input)`    | `category.createCategory`    |
| `updateCategory(input)`    | `category.updateCategory`    |
| `deleteCategory(input)`    | `category.deleteCategory`    |
| `reorderCategories(input)` | `category.reorderCategories` |

### 4.6 补全 settings.service.ts

| Service 函数               | 来源 Action                  |
| -------------------------- | ---------------------------- |
| `getSettings(input)`       | `settings.getSettings`       |
| `updateSettings(input)`    | `settings.updateSettings`    |
| `changePassword(input)`    | `settings.changePassword`    |
| `uploadAvatar(input)`      | `settings.uploadAvatar`      |
| `updateCommentSort(input)` | `settings.updateCommentSort` |

### 4.7 补全 notification.service.ts

| Service 函数                    | 来源 Action                            |
| ------------------------------- | -------------------------------------- |
| `getUnreadCount(input)`         | `notifications.getUnreadCount`         |
| `deleteNotification(input)`     | `notifications.deleteNotification`     |
| `deleteAllNotifications(input)` | `notifications.deleteAllNotifications` |
| `markNotificationsRead(input)`  | `notifications.markNotificationsRead`  |

### 4.8 提取 posts.service.ts（帖子扩展功能）

| Service 函数                | 来源 Action                |
| --------------------------- | -------------------------- |
| `getPostLikers(input)`      | `posts.getPostLikers`      |
| `togglePin(input)`          | `posts.togglePin`          |
| `verifyPostPassword(input)` | `posts.verifyPostPassword` |

### 4.9 提取 recommend.service.ts

| Service 函数          | 来源 Action              |
| --------------------- | ------------------------ |
| `getRecommend(input)` | `recommend.getRecommend` |
| `recordRead(input)`   | `recommend.recordRead`   |

**完成标准**：

- 所有 Action handler 均为薄适配层（≤15 行）
- 每个 service 函数有明确的输入输出接口
- `astro build` 通过

---

## M5：Agent API 升级 + 新增简化 API

> 目标：基于 service 层，升级 Agent API 并新增面向第三方开发者的简化 API。

### 5.1 Agent API 统一改造

当前 Agent API 全部返回 `text/plain`，对开发者不友好。基于 service 层，可以提供 JSON 响应版本：

**方案**：保留现有纯文本 API（向后兼容），新增 JSON 响应头支持：

```typescript
// 通过 Accept header 区分响应格式
// Accept: text/plain → 纯文本（现有行为）
// Accept: application/json → JSON（新增）
```

或者更简洁的方案：**新增 `/api/v2/` 路由**，全部返回 JSON，基于 service 层薄封装。

### 5.2 新增简化 API 端点

基于 service 层，快速提供以下 API：

| 端点                      | 方法   | Service 函数                  | 说明                   |
| ------------------------- | ------ | ----------------------------- | ---------------------- |
| `/api/v2/posts`           | GET    | content.getPosts              | 帖子列表（分页、过滤） |
| `/api/v2/posts/:id`       | GET    | content.getPost               | 帖子详情               |
| `/api/v2/posts`           | POST   | content.createPost            | 发帖                   |
| `/api/v2/posts/:id`       | PUT    | content.updatePost            | 编辑帖子               |
| `/api/v2/posts/:id`       | DELETE | content.deletePost            | 删除帖子               |
| `/api/v2/comments`        | POST   | content.createComment         | 发表评论               |
| `/api/v2/comments/:id`    | DELETE | content.deleteComment         | 删除评论               |
| `/api/v2/likes`           | POST   | social.toggleLike             | 点赞/取消              |
| `/api/v2/follows`         | POST   | social.toggleFollow           | 关注/取消              |
| `/api/v2/bookmarks`       | POST   | social.toggleBookmark         | 收藏/取消              |
| `/api/v2/upload`          | POST   | media.uploadFile              | 文件上传               |
| `/api/v2/users`           | GET    | —                             | 用户列表               |
| `/api/v2/users/:username` | GET    | —                             | 用户详情               |
| `/api/v2/notifications`   | GET    | notification.getNotifications | 通知列表               |
| `/api/v2/search`          | GET    | search.searchSuggest          | 搜索建议               |

**每个端点的实现模式**：

```typescript
// src/pages/api/v2/likes.ts
import { toggleLike } from '@/services/social.service';
import { requireApiAuth, jsonResponse, jsonErrorResponse } from '@/lib/api-v2';

export const POST: APIRoute = async (context) => {
	const authResult = await requireApiAuth(context);
	if (!authResult) return jsonErrorResponse('未认证', 401);

	const body = await context.request.json();
	const result = await toggleLike({
		userId: authResult.userId,
		targetId: body.targetId,
		type: body.type
	});

	return jsonResponse(result);
};
```

### 5.3 统一 API 鉴权中间件

创建 `src/lib/api-v2.ts`，提供：

- `requireApiAuth()` — 复用 `getUserFromRequest`，支持 API Token / JWT / cookie
- `jsonResponse()` — 统一 JSON 成功响应格式
- `jsonErrorResponse()` — 统一 JSON 错误响应格式
- `parsePagination()` — 复用现有分页解析

### 5.4 API 文档自动生成

基于 service 层的接口定义，可以自动生成 OpenAPI 文档：

- 每个 service 函数的输入/输出接口 → OpenAPI schema
- zod schema → JSON Schema 转换
- 替换当前手写的 `docs.json.ts`

**完成标准**：

- `/api/v2/` 端点全部可用
- 统一 JSON 响应格式
- API 文档自动生成
- 旧 Agent API 保持兼容

---

## M6：清理与收尾

> 目标：移除废弃代码，统一编码风格。

### 6.1 标记旧 Agent API 为 deprecated

- 所有 `/api/agent/` 文件添加 `@deprecated` 注释，指向 `/api/v2/` 替代
- 响应头添加 `Deprecation: true` + `Link: /api/v2/xxx; rel="successor-version"`
- 保留一个版本周期后移除

### 6.2 移除 `/api/upload.ts`

- 已被 `media.uploadMedia` Action 和 `/api/v2/upload` 完全覆盖
- 修改 `BlogEditor.tsx` 改用 `/api/v2/upload` 或 `actions.uploadMedia`

### 6.3 统一 Action handler 风格

所有 Action handler 统一为：

```typescript
export const xxxAction = defineAction({
  input: z.object({ ... }),
  handler: async (input, context) => {
    const currentUser = await getUserFromRequest(context);
    if (!currentUser) throw new ActionError({ code: 'UNAUTHORIZED', message: '请先登录' });

    return xxxService({ userId: currentUser.userId, ...input });
  }
});
```

### 6.4 清理 lib 层中已迁移到 service 的编排逻辑

检查 lib 层中是否有应属于 service 层的编排逻辑（如 `queries.ts` 中的复杂查询），按需迁移。

**完成标准**：

- 旧 API 标记 deprecated
- Action handler 风格统一
- 无冗余代码

---

## 里程碑依赖关系

```
M1（基础 + 验证）
 │
 ├─→ M2（高重复度 service）
 │     │
 │     └─→ M3（中等重复度 service）
 │           │
 │           └─→ M4（补全所有 service）
 │                 │
 │                 └─→ M5（新增 API + 文档）
 │                       │
 │                       └─→ M6（清理收尾）
```

M1 → M2 必须顺序执行。M3-M6 中，每个里程碑内部的任务可以按模块并行推进。

---

## 文件变更预估

| 里程碑 | 新增文件                                                             | 修改文件                                  | 删除文件           |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- | ------------------ |
| M1     | 3（services/ + errors.ts + social.service.ts）                       | 3（social.ts + agent/likes.ts + auth.ts） | 0                  |
| M2     | 3（auth/content/settings/media.service.ts）                          | 8（4 actions + 4 APIs）                   | 0                  |
| M3     | 0（补全已有 service）                                                | 5（3 actions + 2 APIs）                   | 0                  |
| M4     | 6（search/config/webhook/token/category/posts/recommend.service.ts） | 7（7 actions）                            | 0                  |
| M5     | 15+（api/v2/ 路由文件 + api-v2.ts）                                  | 2（BlogEditor.tsx + docs）                | 0                  |
| M6     | 0                                                                    | 若干                                      | 1（api/upload.ts） |
