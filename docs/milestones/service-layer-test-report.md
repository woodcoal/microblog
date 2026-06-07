# Service 层重构后功能测试报告

## 测试环境

- 地址: http://localhost:4321/
- 测试账号: testbot (通过 Agent API 注册)
- 测试时间: 2026-06-07

---

## 测试结果汇总

| #   | 功能         | Service              | 测试方式                        | 结果     | 备注                                 |
| --- | ------------ | -------------------- | ------------------------------- | -------- | ------------------------------------ |
| 1   | 注册         | auth.service         | Agent API + Astro Actions       | **正常** | 两种路径均正常，Actions 返回 JWT     |
| 2   | 登录         | auth.service         | Agent API + Astro Actions       | **正常** | 错误凭据正确返回 401                 |
| 3   | 帖子列表     | posts (Agent API)    | GET /api/agent/posts            | **正常** | 支持 latest/hot/earliest 排序        |
| 4   | 帖子详情     | posts (Agent API)    | GET /api/agent/posts/:id        | **正常** | 返回完整帖子信息                     |
| 5   | 发帖         | content.service      | POST /api/agent/posts + Actions | **正常** | 空内容正确返回 400                   |
| 6   | 点赞         | social.service       | POST /api/agent/likes           | **正常** | like/unlike 幂等性正确               |
| 7   | 取消点赞     | social.service       | POST /api/agent/likes           | **正常** | 状态切换正确                         |
| 8   | 评论         | content.service      | POST /api/agent/comments        | **正常** | 返回评论 ID                          |
| 9   | 关注         | social.service       | POST /api/agent/follows         | **正常** | follow/unfollow 幂等性正确           |
| 10  | 取关         | social.service       | POST /api/agent/follows         | **正常** | 状态切换正确                         |
| 11  | 收藏         | social.service       | Astro Actions toggleBookmark    | **正常** | bookmarked/bookmarkCount 正确返回    |
| 12  | 取消收藏     | social.service       | Astro Actions toggleBookmark    | **正常** | 状态切换正确                         |
| 13  | 修改个人资料 | settings.service     | PUT /api/agent/profile          | **正常** | displayName/bio 更新成功             |
| 14  | 获取设置     | settings.service     | Astro Actions getSettings       | **正常** | theme/accent/sortOrder 等正确返回    |
| 15  | 更新设置     | settings.service     | Astro Actions updateSettings    | **正常** | theme 切换 dark 成功                 |
| 16  | 个人记录读取 | settings.service     | GET /api/agent/note             | **正常** | 空记录返回空字符串                   |
| 17  | 个人记录写入 | settings.service     | PUT /api/agent/note             | **正常** | 更新成功                             |
| 18  | 文件上传     | media.service        | POST /api/agent/upload          | **正常** | 返回文件 URL                         |
| 19  | 用户搜索     | search.service       | GET /api/agent/users?keyword=   | **正常** | 模糊匹配 username/displayName        |
| 20  | 搜索建议     | search.service       | Astro Actions searchSuggest     | **正常** | 返回 tags/users/categories           |
| 21  | 精确用户搜索 | search.service       | Astro Actions searchUsers       | **正常** | 按用户名列表精确匹配                 |
| 22  | 通知未读数   | notification.service | Astro Actions getUnreadCount    | **正常** | 返回 count                           |
| 23  | 通知列表     | notification.service | Astro Actions getNotifications  | **正常** | 游标分页正常                         |
| 24  | 前端页面渲染 | -                    | HTTP GET 多页面                 | **正常** | 首页/登录/搜索/详情等 9 个页面均 200 |

---

## 发现的问题

### 1. 管理员账号 Agent API 登录 401 (低优先级)

- **现象**: 使用种子数据 `admin@mutan.vip / admin123` 通过 Agent API 登录返回 401
- **原因**: 种子脚本创建的管理员账号没有 API Token，Agent API 的 login 端点在验证密码后检查 Token 存在性，无 Token 时返回错误
- **影响**: 仅影响 Agent API 登录路径，Web 端登录（Astro Actions）不受影响
- **建议**: 这是设计行为（Agent API 需要 Token），但错误码应为 404 而非 401

### 2. 反馈页面 404 (信息)

- **现象**: `/mutan/Yu6JFkbL` 和 `/mutan/afRyu9Ra` 返回 404
- **原因**: 这些帖子 ID 在数据库中不存在
- **影响**: 无功能影响

### 3. Astro Actions void 输入不接受 JSON body (信息)

- **现象**: `getUnreadCount`、`getSettings` 等使用 `z.void()` 输入的 Actions，发送 `{}` 作为 body 时返回 400
- **原因**: Astro Actions 的 void 输入类型不接受请求体
- **影响**: 不影响前端使用（前端通过 SDK 调用），仅影响直接 HTTP 调用

---

## 测试覆盖的 Service 文件

| Service 文件            | 测试的功能                                   |
| ----------------------- | -------------------------------------------- |
| auth.service.ts         | registerUser, loginUser                      |
| social.service.ts       | toggleLike, toggleFollow, toggleBookmark     |
| content.service.ts      | createComment                                |
| settings.service.ts     | updateProfile, getSettings, updateSettings   |
| media.service.ts        | uploadFile                                   |
| search.service.ts       | searchUsers, searchSuggest                   |
| notification.service.ts | getUnreadNotificationCount, getNotifications |

---

## 结论

**Service 层重构后所有核心功能正常工作。** 24 项测试全部通过，三个发现的问题均为低优先级/信息级别，不影响正常使用。
