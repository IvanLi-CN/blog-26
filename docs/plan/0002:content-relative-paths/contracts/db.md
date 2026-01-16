# 数据库（DB）

## `posts.metadata.attachments[].path` 语义调整

- 范围（Scope）: internal
- 变更（Change）: Modify
- 影响表（Affected tables）: `posts`

### Schema delta（结构变更）

- 不新增列；变更字段语义（数据形态）：
  - `posts.metadata`（JSON string）内的 `attachments[]` 中 `path` 字段，持久化形态从“可能为 `/api/files/...`”收敛为“规范化相对路径”。

建议附件项 shape（保持最小集合，其他字段按现状保留）：

```ts
type Attachment = {
  filename: string;
  path: string; // Normalized Relative Path (no /api/files/, may include ../)
  isImage: boolean;
  contentType?: string;
  size?: number;
};
```

### Migration notes（迁移说明）

- 写入侧（create/update）必须在入库前对 `attachments[].path` 做规范化：
  - `/api/files/<source>/<resolvedPath>` → 相对路径（相对于该内容的 `filePath` 所在目录）
  - `/something/...`（站点绝对路径）：按 content-root-relative 解释后，转成相对路径
- 读取侧（list/get）对外返回时可将相对路径映射为可访问 URL（例如 `/api/files/local/...`），但不得回写 DB。

### 回滚策略（Rollback strategy）

- 如需回滚到旧语义：保留扫描工具与迁移工具，允许把相对路径再映射回 `/api/files/...`（不建议；仅作为紧急 fallback）。
