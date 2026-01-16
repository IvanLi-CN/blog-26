# HTTP API

## 文件代理（GET/POST/PUT `/api/files/{source}/{...path}`）

- 范围（Scope）: internal
- 变更（Change）: Modify
- 鉴权（Auth）: session（管理员写入；读取沿用现状）

### 请求（Request）

- Path params:
  - `source`: `local | webdav`
  - `path`: `string`（`/` 分隔的相对路径，必须通过路径穿越校验）

#### GET

- Response:
  - `200`: 文件二进制（`Content-Type` 由扩展名或现有逻辑决定）
  - `404`: `{ "error": "文件不存在" }`
  - `400`: `{ "error": "不支持的内容源" | "不安全的文件路径" }`
  - `500`: `{ "error": "读取文件失败" }`

#### POST/PUT（上传）

- Headers:
  - `Content-Type`: `multipart/form-data` 或具体 mime（例如 `image/png`）
- Body:
  - multipart: `file` 字段
  - non-multipart: raw binary

Response:

```json
{
  "success": true,
  "path": "blog/assets/example.png",
  "url": "/api/files/local/blog/assets/example.png"
}
```

Errors:

- `400`: `{ "error": "不支持的内容源" | "不安全的文件路径" | "文件太大。最大支持 10MB" | "表单中未找到文件" }`
- `500`: `{ "error": "文件上传失败" }`

### 兼容性与迁移（Compatibility / migration）

- 本端点属于运行时文件代理：允许出现在渲染/网络请求中，但不得持久化到 Markdown/DB。
- FS-only 下的约定：
  - `local` 必须可用；
  - `webdav` 在 FS-only 明确禁用，不提供兼容期。
    - GET：若请求目标为图片（建议按扩展名或 `Accept: image/*` 判断），返回 `200` 的占位图（建议 `image/svg+xml`），且包含固定错误文案（待主人确认最终文案字符串）。
    - GET：若请求目标为图片（建议按扩展名或 `Accept: image/*` 判断），返回 `200` 的占位图（`image/png`），内容为固定文案（见下文）。
    - GET：非图片请求返回固定 JSON 错误（`410`），不得尝试回退到 WebDAV。
    - POST/PUT：返回固定 JSON 错误（`410`），不得写入任何内容。

#### 固定错误（frozen）

- Error code: `ERR_WEBDAV_DISABLED`
- Error message: `WebDAV 已禁用：请将内容中的 /api/files/webdav/... 链接迁移为相对路径`

JSON 错误 schema（建议）：

```json
{
  "error": "ERR_WEBDAV_DISABLED",
  "message": "WebDAV 已禁用：请将内容中的 /api/files/webdav/... 链接迁移为相对路径"
}
```

占位图 PNG（建议）：

- `200` + `Content-Type: image/png`
- 画面内容包含三行固定文本：
  - `WebDAV 已禁用`
  - `请将内容中的 /api/files/webdav/... 链接迁移为相对路径`
  - `ERR_WEBDAV_DISABLED`
- 资源文件参考：`docs/plan/0002:content-relative-paths/assets/webdav-disabled.png`
