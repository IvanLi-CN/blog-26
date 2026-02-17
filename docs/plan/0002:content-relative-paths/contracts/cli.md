# 命令行（CLI）

## `bun run content:scan-api-links`（新增）

- 范围（Scope）: internal
- 变更（Change）: New

### 用法（Usage）

```text
bun run content:scan-api-links [--format human|json] [--fail-on-found] [--include-db]
```

### 参数（Args / options）

- `--format`: 输出格式（default: `human`）
- `--fail-on-found`: 若发现 `/api/files/` 落盘引用则 exit 非 0（default: false）
- `--include-db`: 额外扫描 DB 元数据（default: false）

### 输出（Output）

- Format: `human` or `json`
- Schema（if json）:

```json
{
  "found": true,
  "counts": {
    "markdown": 12,
    "db": 3
  },
  "samples": [
    {
      "kind": "markdown",
      "file": "blog/example.md",
      "match": "/api/files/webdav/blog/assets/a.png"
    }
  ]
}
```

### 退出码（Exit codes）

- `0`: 未发现（或未开启 fail-on-found）
- `2`: 发现落盘引用且 `--fail-on-found` 为 true
- `1`: 其他错误（IO/DB 连接等）

### 兼容性与迁移（Compatibility / migration）

- 作为“删除 WebDAV 前置条件”的证明工具：CI 可启用 `--fail-on-found`。

## `bun run content:migrate-api-links`（新增）

- 范围（Scope）: internal
- 变更（Change）: New

### 用法（Usage）

```text
bun run content:migrate-api-links [--dry-run] [--apply] --backup-dir <dir> [--include-db]
```

### 参数（Args / options）

- `--dry-run`: 仅打印计划变更，不写入（default: true）
- `--apply`: 执行写入（与 `--dry-run` 互斥）
- `--backup-dir`: 备份输出目录（当 `--apply` 时必填；当 `--dry-run` 时可选）
- `--include-db`: 同时迁移 DB（default: false）

### 输出（Output）

- Human 输出必须包含：
  - 计划修改的文件数 / 记录数
  - 每种转换的计数（例如 `api->relative`）
  - 至少 3 条样例（file + before + after）

### 退出码（Exit codes）

- `0`: 成功（包括 dry-run）
- `1`: 其他错误（IO/DB 连接等）
- `2`: 参数错误（例如 `--apply` 未提供 `--backup-dir`）
