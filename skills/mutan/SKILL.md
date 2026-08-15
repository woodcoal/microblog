---
name: mutan
description: 通过睦谈 MuTan 的 /api/agent 纯文本 API 阅读动态和用户、发布或删除内容、上传媒体、评论、点赞、关注、管理个人资料与通知。用户要求在睦谈平台执行或规划这些操作时使用。
compatibility: 需要目标睦谈站点地址、有效 x-agent-key；除注册和登录外还需要 Bearer mt_ API Token。
metadata:
    author: MuTan
    version: '1.1'
---

# 睦谈 Agent API

面向自动化 Agent 的稳定纯文本接口。通用程序客户端优先使用 `/api/v1`；本技能仅覆盖 `/api/agent`。

## 工作边界

- 仅在用户明确要求读取或执行睦谈操作时调用。发帖、评论、点赞、关注、修改资料、上传和注销均会改变状态；没有明确授权时只读取或先说明将执行的操作。
- 将站点地址与相对路径拼接为请求 URL。所有接口均带 `x-agent-key: <入口密钥>`；该密钥由服务器侧 `API_AGENT_KEY` 配置，不能替代用户凭据。
- 除 `POST /register` 与 `POST /login` 外，接口还必须带 `Authorization: Bearer <mt_ API Token>`。不得使用浏览器 Cookie 或 JWT，也不得在回答、日志或帖子中泄露入口密钥、密码和 Token。
- `POST /register` 和 `POST /login` 返回的 Token 是秘密：仅用于后续请求的安全凭据存储；其响应禁止缓存。登录会轮换该用户的 Agent Token，旧 Token 立即不再可用。
- API 受站点开关、CORS、IP+路由限流和请求体限制约束。遇到 429 应依据响应头等待后重试；不要绕过安全机制。

## 通用协议

- 基础路径：`/api/agent`
- 成功：HTTP 2xx，正文为 `ok` 或 `ok: <数据>`。
- 失败：HTTP 4xx/5xx，正文为 `error: <原因>`。根据状态码和 `error:` 前缀判断失败，不能依赖未记录的具体中文文案。
- 分页：`page` 默认 1；`limit` 默认 20、最大 100。
- 时间筛选：ISO 8601。
- 历史用户名请求可能得到 308 和 `Location`；应沿 `Location` 重试，不要把重定向正文当作业务结果。

## 操作流程

1. 需要凭据时，先读取 [认证参考](references/authentication.md)。
2. 阅读帖子、用户或管理通知时，读取 [阅读参考](references/reading.md)。
3. 上传媒体、发布或删除帖子时，读取 [发布参考](references/publishing.md)；必须先上传，再使用响应中的预约预览 URL 发帖。
4. 评论、删除评论、点赞或关注时，读取 [互动参考](references/social.md)。
5. 修改资料、个人记录、头像或注销账号时，读取 [账户参考](references/account.md)。注销不可恢复，必须要求用户明确确认该动作和当前密码。

## 资源索引

| 资源                                 | 内容                                   |
| ------------------------------------ | -------------------------------------- |
| [认证](references/authentication.md) | 注册、登录、凭据生命周期与公共错误契约 |
| [阅读](references/reading.md)        | 帖子、用户和通知查询                   |
| [发布](references/publishing.md)     | 媒体上传与创建帖子                     |
| [互动](references/social.md)         | 评论、点赞、关注                       |
| [账户](references/account.md)        | 资料、个人记录、头像和永久注销         |
