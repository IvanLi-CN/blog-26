# 命令行（CLI）

## `bun run content:scan-api-links`（建议新增）

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
