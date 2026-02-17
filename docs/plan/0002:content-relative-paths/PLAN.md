# 内容持久化相对路径（去 API 化，FS-only 准备）（#0002）

## 状态

- Status: 已完成
- Created: 2026-01-16
- Last: 2026-02-17

## 背景 / 问题陈述

当前系统在编辑器上传图片/附件、以及部分元数据持久化时，会把资源引用写成绝对的文件代理 API 路径（`/api/files/<source>/...`）。这会把内容与具体协议/实现强耦合（例如 `webdav/local` 标识进入内容本身），影响长期可迁移性：未来若切换为仅文件系统（FS-only）或移除 WebDAV，实现变更可能导致历史内容断链。

本计划希望把“持久化内容只使用相对路径”作为系统级不变量：内容落盘与 DB 元数据不包含 `/api/files/`，运行时渲染再做可访问 URL 的映射。

## 目标 / 非目标

### Goals

- 持久化内容（Markdown + 相关元数据）中的资源引用**统一为规范化相对路径**，不包含 `/api/files/` 前缀，也不包含 `webdav/local` 这类源标识。
- 运行时渲染/网络请求允许把相对路径映射为 `/api/files/<source>/...`，但该映射不得写回内容文件或 DB 元数据。
- 默认内容源不再偏向 WebDAV：在未显式指定时默认使用本地文件系统（`local`）。
- 提供迁移/校验方案，确保“迁移完成前不再产生新的 `/api/files/...` 落盘引用”。
- 定义 FS-only 端到端验证与“可删除 WebDAV 实现”的前置条件（不在本计划内直接删除，先冻结口径与门槛）。

### Non-goals

- 评论系统与分布式部署优化。
- 向量化数据的历史兼容（允许按文件系统内容重建）。
- 重新设计资源访问鉴权模型（沿用现有权限/大小限制/穿越防护策略，只补齐口径与测试）。

## 范围（Scope）

### In scope

- 文章编辑器与 memo 编辑器：上传图片/附件（含粘贴内联 base64 图片）后写回 Markdown 的链接格式（改为规范化相对路径）。
- Markdown 渲染链路：相对路径解析规则与运行时 URL 转换（渲染时才生成 `/api/files/<source>/...`）。
- memo/文章元数据中的附件路径字段（例如 `posts.metadata.attachments[].path`）的存储格式（去 API 化 + 规范化）。
- 默认值与数据源选择：未显式指定时默认 `local`，写入端不产生 `webdav` 标识进入内容或元数据。
- 迁移机制与校验：对既有内容/元数据中出现的 `/api/files/...` 提供批处理或同步流程内的自动规范化；并提供扫描校验工具/输出规范。
- FS-only 验证门槛：定义“仅启用本地内容源”时的端到端验证步骤与通过标准。

### Out of scope

- 历史向量化索引兼容（可重建）。
- 多实例/分布式部署下的内容一致性与并发写入优化。

## 需求（Requirements）

### MUST

- 内容落盘（Markdown）中不得出现以 `/api/files/` 开头的链接；若用户手工输入了该形式，保存时必须转换为规范化相对路径。
- 上传后写回 Markdown 的链接必须是规范化相对路径（文章编辑器、memo 编辑器、快速 memo 均一致）。
- 资源落盘与 Markdown 必须位于同一 volume 可访问范围内，且默认落盘结构可在 FS-only 下工作（文章默认 `./assets/<file>`；memo 默认跟随 memo 文件目录的 `./assets/<file>`）。
- DB 元数据中的附件路径字段（例如 `metadata.attachments[].path`）不得持久化 `/api/files/...`；服务端规范化不得产生 `webdav/local` 进入持久化字段。
- 渲染层允许将相对路径转换为 `/api/files/<source>/...` 读取，但不得污染内容文件与 DB 元数据（不回写）。
- 未显式指定内容源时，默认内容源为 `local`；任何写入端默认行为不得产生 `webdav` 标识进入内容或元数据。

### SHOULD

- 文章与 memo 的路径规则统一、可预测（同一套“解析/规范化/安全校验”函数贯穿前端与服务端，避免多处实现漂移）。
- 迁移具备幂等性：重复运行不会产生二次改写或路径抖动。
- “规范化/迁移转换”具备可观测性（可控开关/仅 debug 输出），便于定位异常输入与转换结果。

### COULD

- 提供一个 “strict mode” 校验：在 dev/test 环境对写入前的内容/元数据做断言，发现 `/api/files/` 直接拒绝保存并返回可读错误（用于提前暴露回归）。

## 接口契约（Interfaces & Contracts）

### 接口清单（Inventory）

| 接口（Name） | 类型（Kind） | 范围（Scope） | 变更（Change） | 契约文档（Contract Doc） | 负责人（Owner） | 使用方（Consumers） | 备注（Notes） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Persisted markdown resource links | File format | internal | Modify | ./contracts/file-formats.md | FE/BE | 编辑器、渲染器、迁移工具 | 规定“落盘只允许相对路径”与规范化形式 |
| `posts.metadata.attachments[].path` | DB | internal | Modify | ./contracts/db.md | BE | memos API、sync、渲染 | 元数据附件路径去 API 化 |
| `GET/POST/PUT /api/files/{source}/{...path}` | HTTP API | internal | Modify | ./contracts/http-apis.md | BE | 编辑器上传、渲染读取、迁移校验 | 运行时代理端点；FS-only 下允许禁用 webdav |
| `memos.*` (tRPC) attachments semantics | RPC | internal | Modify | ./contracts/rpc.md | BE/FE | memo 编辑器、列表/详情 | 上传/保存时考虑相对路径与默认 source |
| Content source selection defaults | Config | internal | Modify | ./contracts/config.md | BE | 全栈 | 默认 `local`，FS-only 时不要求 WEBDAV 配置 |
| `content:scan-api-links` | CLI | internal | New | ./contracts/cli.md | BE | CI/开发者 | 扫描内容与 DB 中的 `/api/files/` 落盘引用 |
| `content:migrate-api-links` | CLI | internal | New | ./contracts/cli.md | BE | CI/开发者 | 将历史 `/api/files/...` 链接迁移为规范化相对路径（支持 dry-run） |

### 契约文档（按 Kind 拆分）

- [contracts/README.md](./contracts/README.md)
- [contracts/file-formats.md](./contracts/file-formats.md)
- [contracts/db.md](./contracts/db.md)
- [contracts/http-apis.md](./contracts/http-apis.md)
- [contracts/rpc.md](./contracts/rpc.md)
- [contracts/config.md](./contracts/config.md)
- [contracts/cli.md](./contracts/cli.md)

## 验收标准（Acceptance Criteria）

- Given 在文章编辑器中上传图片或粘贴内联 base64 图片
  When 保存文章
  Then 文章 Markdown 文件中不包含 `/api/files/` 字符串，图片链接为规范化相对路径，页面渲染图片正常显示。

- Given 在 memo 编辑器（含快速 memo）中上传图片或粘贴内联 base64 图片
  When 保存 memo
  Then memo Markdown 文件中不包含 `/api/files/` 字符串，图片链接为规范化相对路径，页面渲染正常显示。

- Given 创建/更新内容产生 attachments 元数据
  When 查看 DB 中 `metadata.attachments[].path`
  Then 其值不包含 `/api/files/`，且渲染/下载仍正常工作。

- Given 未配置 WebDAV（或未显式指定 content source）
  When 创建新内容并上传资源
  Then 不会生成任何 `webdav` 前缀链接；渲染与上传路径按 `local` 工作。

- Given 仅启用本地文件系统内容源（FS-only）
  When 触发“以文件系统为真源”的重建（DB + 向量化允许重建）
  Then 文章列表/详情、memo 列表/详情、图片/附件均正常；且满足 MUST 约束。

- Given 运行扫描/校验工具
  When 对内容目录与 DB 元数据执行校验
  Then 不存在 `/api/files/` 落盘引用（特别是 `/api/files/webdav/`），满足后续删除 WebDAV 的前置条件。

## 非功能性验收 / 质量门槛（Quality Gates）

### Testing

- Unit tests:
  - 路径规范化：`/api/files/<source>/...` → 相对路径、`image.png` → 规范化相对路径、`../` 解析与边界。
  - 默认 source：未指定时默认 `local`（覆盖渲染与工具函数的默认值）。
- Integration tests:
  - memo create/update：服务端入库前对 attachments 与 markdown 内容的去 API 化与规范化（不产生回写污染）。
- E2E tests:
  - 文章上传 + 保存 + 刷新后仍能显示（验证“渲染时转成 API，但落盘仍是相对路径”）。
  - memo 上传 + 保存 + 刷新后仍能显示。
  - FS-only 演练：按 `docs/runbooks/fs-only-migration.md` 执行完整迁移 + 校验 + E2E（作为合并前质量门槛）。

### Quality checks

- `bun run check`
- `bun run test`
- `bun run test:e2e`（至少覆盖本计划新增的上传/保存路径用例）

## 文档更新（Docs to Update）

- `docs/memos-data-flow.md`: 补充 memo 附件路径“持久化相对路径 / 运行时映射”的口径与示例。
- `docs/mcp-http.md`（如涉及对外暴露的行为口径变化）: 增补文件代理 API 在 FS-only 下的约定。
- `docs/runbooks/fs-only-migration.md`: 测试环境完整迁移演练（dry-run → apply → scan → FS-only 启动与回滚）。

## 里程碑（Milestones）

- [x] M1: 冻结“规范化相对路径”与解析规则（含示例与边界），并落到契约文档
- [x] M2: 写入端改造口径冻结（文章编辑器 + memo 编辑器 + 服务端入库前规范化）
- [x] M3: 渲染链路默认 `local`，且仅在运行时映射为 `/api/files/<source>/...`（不回写）
- [x] M4: 迁移与校验工具落地（批处理/同步过程规范化 + 扫描报告）
- [x] M5: FS-only 端到端验证通过（重建 DB/向量化 + 核心页面验证）

## 方案概述（Approach, high-level）

- 把“持久化路径”与“可访问 URL”分层：
  - Persisted: 只允许相对路径（以 markdown 所在目录为基准）；统一规范化输出（默认 `./assets/<file>`）。
  - Runtime: 渲染时将相对路径解析为“内容源根目录下的绝对文件路径”，再映射为 `/api/files/<source>/<resolvedPath>`。
- 规范化与安全校验集中化：前端为体验做即时转换，服务端作为最终守门人（保存/入库前再次规范化与拒绝非法路径）。
- 迁移策略以“内容文件为真源”为优先：允许重建 DB 与向量化；对既有 `/api/files/...` 引用做一次性规范化，且迁移完成前禁止产生新的落盘引用。
- FS-only 准备：在不删除 WebDAV 的前提下，先让默认行为不依赖 WebDAV；通过验证门槛后再进入“移除 WebDAV”计划（可另起计划或在本计划完成后追加）。

## 风险与开放问题（Risks & Open Questions）

- 风险：
  - 相对路径换算错误会造成运行时断图/断链，需要用 E2E + 扫描校验兜底。
  - 历史内容路径形态多样（`/api/files/...`、`/assets/...`、无前缀相对路径等），迁移策略需要明确优先级与幂等性。
  - 仅启用 local 时，当前配置校验可能仍强依赖 `WEBDAV_URL`，需要定义清晰的 FS-only 口径与测试覆盖。

- 已确认的决策（Decisions）：
  - memo 资源目录：强制与 memo 文件同级 `./assets/`（随目录走）。
  - 无前缀相对路径：`image.png` 规范化为 `./image.png`（不强制改到 `./assets/`）。
  - 站点绝对路径：如 `/assets/image.png` 保存时一律转换为相对路径。
  - 跨目录引用：允许持久化 `../shared/image.png`（保存时仅做安全校验与规范化）。
  - FS-only：不保留 `/api/files/webdav/...` 兼容期；当运行时收到 `webdav` 读取请求时，返回“带固定错误信息文案的占位图（PNG）”，便于用户识别问题；非图片请求返回固定 JSON 错误。
  - 占位图固定文案（frozen）：
    - 标题：`WebDAV 已禁用`
    - 副标题：`请将内容中的 /api/files/webdav/... 链接迁移为相对路径`
    - 错误码：`ERR_WEBDAV_DISABLED`

- 假设（Assumptions，若未决策则按此推进）：
  - 占位图返回策略：仅对图片类请求返回占位图 PNG（按扩展名或 `Accept: image/*` 判断）；非图片下载返回固定 JSON 错误（见 `contracts/http-apis.md`）。

## 参考（References）

- `src/components/editor/UniversalEditor.tsx`（上传后写回 Markdown 的链接目前使用 `/api/files/webdav/...`）
- `src/components/memos/QuickMemoEditor.tsx`（快速 memo 上传目前使用 `/api/files/webdav/...`）
- `src/lib/image-utils.ts` / `src/components/common/markdown/plugins/rehype-image-optimization.ts`（运行时路径解析/默认 source 目前偏向 `webdav`）
- `src/app/api/files/[source]/[...path]/route.ts`（文件代理 API）
- `src/config/paths.ts`（内容源配置与校验）

## 变更记录 / Change log

- 2026-02-17: 实现“持久化相对路径”不变量（编辑器/服务端守门人/迁移工具），并通过 FS-only E2E 验证门槛。
