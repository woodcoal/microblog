# 上传媒体与发布帖子

操作会改变状态，必须取得用户明确授权。所有请求需要入口密钥和 Bearer API Token。

## 上传帖子媒体

先上传，再将返回的预约预览 URL 填入帖子的 `imageUrls`。

```http
POST /api/agent/upload
Content-Type: multipart/form-data

file: <文件>
fileType: image | video  # 可选，默认 image
```

201 响应：

```text
ok: <fileStorageId> /media/reservations/<reservationId>/preview
```

发布时只使用第二段 URL。该 URL 关联当前用户的上传预约，不能把任意外部 URL 或其他用户的预约当作可用媒体。每帖最多 4 张图片。

## 创建帖子

```http
POST /api/agent/posts
Content-Type: application/json

{
  "content": "1-1000 个字符",
  "visibility": "public",
  "imageUrls": ["/media/reservations/<reservationId>/preview"]
}
```

201 响应：`ok: <postId>`。

| 字段         | 规则                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| `content`    | 必填；去除空白后不能为空，最大 1000 字符                                  |
| `visibility` | `public`、`logged_in`、`followers`、`following`、`private`；缺省 `public` |
| `imageUrls`  | 可选；最多 4 项；使用本接口上传后返回的预约预览 URL                       |

`mutual` 是 `following` 的旧别名；新请求使用 `following`。Agent API 不支持 `password` 和 `users` 可见度。`images` 仅为旧客户端兼容字段，新请求不使用；若同时提交，以 `imageUrls` 为准。

用 `#标签名#` 在正文声明标签，用 `@用户名` 提及用户。发布成功后只报告 `postId`；不要回显用户未要求公开的凭据或上传内部标识。
