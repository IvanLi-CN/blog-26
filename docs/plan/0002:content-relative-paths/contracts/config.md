# Config

## 内容源选择（defaults & FS-only）

- 范围（Scope）: internal
- 变更（Change）: Modify

### 目标口径

- 未显式指定内容源时，默认使用 `local`。
- FS-only 模式下允许完全不配置 WebDAV（不要求 `WEBDAV_URL` / `WEBDAV_*`），系统仍可启动并完成同步/读写。
- FS-only 模式下，`webdav` 读取不作为兼容入口：对运行时的 `webdav` 文件代理请求执行“显式失败”（默认建议：图片返回占位图，非图片返回固定 JSON 错误；具体文案在 `PLAN.md` 的开放问题中确认）。

### 涉及的配置项（现状 + 目标）

- `LOCAL_CONTENT_BASE_PATH`: 存在时启用本地内容源（FS-only 必须）
- `WEBDAV_URL`: FS-only 模式下可缺省
- `CONTENT_SOURCES`: 若存在则用于白名单筛选；默认应包含 `local`（且当缺省时视为不限制）
- `FORCE_WEBDAV_ONLY`: 计划废弃或仅用于兼容测试；默认不应影响新内容写入策略

### 兼容性与迁移（Compatibility / migration）

- 若历史部署依赖 `WEBDAV_URL` 必填校验：需要提供“FS-only 例外”的规则（例如 `CONTENT_SOURCES=local` 时跳过 WebDAV 必填检查）。
