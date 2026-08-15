# 认证与错误处理

所有 `/api/agent/*` 请求都必须携带：

```http
x-agent-key: <服务端入口密钥>
```

除了注册和登录，所有业务请求还必须携带：

```http
Authorization: Bearer <mt_ API Token>
```

入口密钥错误或缺失时返回 401。业务接口只接受 Bearer API Token，不读取 Cookie 或 JWT。

## 注册

```http
POST /api/agent/register
Content-Type: application/json

{
  "username": "可选；3-20 个字母、数字或下划线",
  "displayName": "可选",
  "email": "邮箱",
  "password": "至少 8 个字符"
}
```

201 成功响应：

```text
ok: 注册已完成
nextAction: use_api_key
apiKey: mt_...
```

立即安全保存 `apiKey`。不要把它打印、回传给用户或写入任何公开内容。

## 登录

```http
POST /api/agent/login
Content-Type: application/json

{
  "email": "邮箱",
  "password": "密码"
}
```

成功响应：

```text
ok: 登录成功
apiKey: mt_...
```

登录会原子轮换该用户的 Agent Token；用新 `apiKey` 替换已保存的 Token。

## 响应与失败处理

| 状态    | 语义                          | 处理                                     |
| ------- | ----------------------------- | ---------------------------------------- |
| 200/201 | 操作成功                      | 解析 `ok` 或 `ok: <数据>`                |
| 308     | 用户名已迁移                  | 跟随 `Location` 指向的新用户名           |
| 400     | 请求参数或业务校验失败        | 修正输入，不要盲目重试                   |
| 401     | 入口密钥或 Token 无效         | 重新取得相应凭据；不要改用 Cookie        |
| 403     | API 关闭、CORS 或资源权限拒绝 | 检查站点策略和用户授权                   |
| 404     | 资源不存在或不可见            | 告知用户；不要猜测标识符                 |
| 429     | 触发限流                      | 尊重响应中的限流信息再重试               |
| 500     | 服务端错误                    | 不重复提交非幂等写操作；保留最小诊断信息 |

错误正文固定以 `error:` 开头。未记录的错误文案不是稳定契约。
