# RPC（tRPC）

## `memos.uploadAttachment`

- 范围（Scope）: internal
- 变更（Change）: Modify
- 鉴权（Auth）: admin session
- 幂等性（Idempotency）: not idempotent

### 请求（Request）

- Schema:
  - `filename: string`
  - `content: string`（base64）
  - `contentType?: string`

### 响应（Response）

返回的 `path` 必须满足“持久化语义”：不得返回 `/api/files/...`，而应返回“可用于落盘引用的相对路径”（或由调用方进一步规范化为 `./assets/<file>`）。

建议响应：

```ts
{
  filename: string;
  path: string; // Normalized Relative Path
  contentType?: string;
  size: number;
  isImage: boolean;
}
```

### 兼容性与迁移（Compatibility / migration）

- 旧行为（返回 WebDAV 相关路径/或导致落盘出现 `/api/files/webdav/...`）需要迁移期兼容：
  - UI/服务端保存入口必须具备“去 API 化”守门能力，即使仍收到旧形态也能规范化后入库/落盘。

## `memos.create` / `memos.update`

- 范围（Scope）: internal
- 变更（Change）: Modify
- 鉴权（Auth）: admin session

### 请求（Request）

- `content: string`（Markdown，持久化内容）
- `attachments: Attachment[]`（持久化元数据）

约束：

- `content` 与 `attachments[].path` 不得包含 `/api/files/`；若包含，服务端必须在写入前转换为规范化相对路径，或返回明确错误（取决于是否启用 strict mode）。

### 响应（Response）

- 对外返回时允许把相对路径映射为可访问 URL（例如 `/api/files/local/...`），但不得回写入库字段。
