# 访客可见错误的过滤与预设

> 本文件是长期需求契约；当前实现事实记录在 `IMPLEMENTATION.md`，生命周期与变更引用记录在 `HISTORY.md`。

## Context and Scope

- Context: 公开接口直接把上游错误文本转给访客。现状包括 tRPC 默认消息（`FORBIDDEN`）、Zod v4 的多行 issue 转储、`unsupported-parameter`、`query-budget-exceeded`、`GitHub reader OAuth is not configured`，以及包含环境变量名的本地内容源报错。只有三处存在白名单：剪藏按错误类放行、助手 `SAFE_GENERATION_ERROR_CODES`、剪藏快照固定文案。管理端仍需要原始技术信息以排查失败。
- In scope: 全部非管理端 HTTP 出口的错误载荷形状、错误码封闭集合、访客预设、错误标识、`/api/trpc/*` 调试信息暴露，以及访客侧界面不得渲染原始文本的约束。
- Out of scope: 管理端错误载荷与界面（见 [admin-error-surface](../admin-error-surface/SPEC.md)）；错误分类的内部实现细节；MCP JSON-RPC 协议层错误码。
- 前置契约: 按身份分级的载荷只在响应不被跨身份复用时可成立；主体绑定响应的缓存边界由 [principal-bound-response-cache](../principal-bound-response-cache/SPEC.md) 定义，本主题不得单独交付。

## Terms and Interfaces

- `可暴露错误`、`错误预设`、`错误标识` 使用 [GLOSSARY.md](../../../GLOSSARY.md) 中的定义。
- `错误标识` 是本主题新增的字段名 `errorRef`，与助手对话回合已有的 `requestId` 是不同概念，不得复用该字段名。
- 非管理端出口包括：`/api/public/*`、`/api/public/chat*`、`/api/public/memos/:slug/clipping/*`、`/api/public/playbook/*`、`/api/public/assets/*`、`/api/files/*`、`/api/trpc/*`、`/api/mcp`。
- 访客错误载荷沿用既有扁平形状并追加字段：`{ "error": <预设文案>, "code"?: <公开码>, "errorRef": <错误标识> }`。管理端错误载荷保持 `{ "error": { "code", "message", "details"? } }` 并追加 `errorRef`。

## Requirements

### REQ-PERR-001 — 访客侧永不返回原始错误文本

- 非管理端出口 MUST 只返回错误预设文案，MUST NOT 返回上游 `message`、异常文本、堆栈、解析器原文或环境变量内容。
- 未登记的技术错误码 MUST 退化为对应 HTTP 状态类的预设文案，而不是透传。
- 访客载荷 MUST NOT 包含 `details`、`zodError`、`stack`、`path` 等结构化调试字段。
- 新增非管理端出口 MUST 默认经过预设映射；直写原始文本视为契约违规。
- 该约束 MUST 在响应不被跨身份复用的前提下成立；缓存边界不成立时本约束不视为已满足。

### REQ-PERR-002 — 错误码必须是封闭集合

- 代码 MUST 以封闭联合类型声明访客可见错误码，并配套单一导出模块承载码到预设的映射。
- 映射 MUST 完整覆盖联合类型；遗漏 MUST 在类型检查期失败。
- 运行时收到不在联合内的码 MUST 走状态类兜底，不得因缺登记而抛错或返回空文案。
- 既有白名单（剪藏错误类、助手安全生成码）MUST 收敛为已登记的公开码，MUST NOT 保留第二套并行判定。

### REQ-PERR-003 — 预设按状态类分组

- 预设 MUST 覆盖且仅覆盖七类语义：网络中断、需要登录、无权限、请求不合法、内容不存在、服务暂不可用、频率限制。
- 同一状态类下不同技术码 MAY 共享文案；文案 MUST NOT 暗示需要用户执行其从未发起过的操作。
- 预设文案 MUST 为简体中文，且 MUST NOT 包含技术码作为用户可见主要信息。

### REQ-PERR-004 — 参数校验失败必须压缩为单条预设

- 公开接口的 Zod 校验失败 MUST 返回“请求不合法”类预设，MUST NOT 返回序列化后的 issue 列表。
- 约束细节（最小/最大值、字段路径）MAY 只在管理端响应中出现。

### REQ-PERR-005 — 调试端点不得暴露内部信息

- `/api/trpc/*` MUST 固定关闭开发模式错误形状，不得随部署环境变量开启。
- 该端点 MUST NOT 返回 `stack`、`zodError` 或原始内部消息；其错误形状 MUST 与访客预设一致。

### REQ-PERR-006 — 每次失败必须可追溯

- 每个非管理端失败响应 MUST 携带 `errorRef`，并 MUST 在同一失败的服务端日志中出现同一标识。
- `errorRef` MUST NOT 编码用户身份、内容标识或可推导的内部路径。
- 管理端失败响应 MUST 同样携带 `errorRef`，便于与访客报障对齐。

### REQ-PERR-007 — 访客界面只渲染预设

- 访客界面 MUST 渲染响应中的预设文案或本地预设，MUST NOT 直接渲染 `error.message` 作为兜底。
- 未识别的错误形状 MUST 退化为本地通用预设，而不是显示响应原文。
- 剪藏讨论、公开搜索、助手对话、公开评论与 Memo 作者态 MUST 共同遵守该约束。

### REQ-PERR-008 — 管理端错误信息不被削弱

- 管理端出口 MUST 继续提供技术码、人读消息与校验细节。
- 本主题 MUST NOT 以减少透传为由删除管理员排查所需的原始文本。

## Verification

### VER-PERR-001

- Method: 对每个非管理端出口注入带敏感原文的上游异常，断言响应体不含该原文、不含环境变量名、不含 `stack` 与 `details`。
- covers: `REQ-PERR-001`
- Pass condition: 全部出口响应体仅含预设文案、公开码与 `errorRef`。

### VER-PERR-002

- Method: 类型检查覆盖映射完整性；运行时用例传入未登记码，断言返回状态类兜底。
- covers: `REQ-PERR-002`
- Pass condition: 删除任一映射条目会使类型检查失败；未登记码返回兜底文案且状态码不变。

### VER-PERR-003

- Method: 快照断言预设表只含七类语义，且每类至少一条文案。
- covers: `REQ-PERR-003`
- Pass condition: 预设表结构与语义集合完全匹配，无额外类别。

### VER-PERR-004

- Method: 请求 `GET /api/public/comments?limit=999` 并断言响应。
- covers: `REQ-PERR-004`
- Pass condition: 返回 400 与“请求不合法”类预设，响应体不含 issue JSON。

### VER-PERR-005

- Method: 在非生产 `NODE_ENV` 下请求 `/api/trpc/*` 触发内部异常。
- covers: `REQ-PERR-005`
- Pass condition: 响应中不存在 `stack`、`zodError` 与原始内部消息。

### VER-PERR-006

- Method: 触发一次已知失败，比对响应 `errorRef` 与服务端日志记录。
- covers: `REQ-PERR-006`
- Pass condition: 两处标识一致，且标识不含用户或内容标识。

### VER-PERR-007

- Method: 检索访客组件中 `error.message` 的直接渲染路径，并对助手对话未知码路径做浏览器用例。
- covers: `REQ-PERR-007`
- Pass condition: 无直接渲染响应原文的兜底路径；未知形状显示本地通用预设。

### VER-PERR-008

- Method: 管理端错误响应用例断言 `code`、`message`、`details` 仍存在。
- covers: `REQ-PERR-008`
- Pass condition: 三个字段保持可用，`errorRef` 为新增字段。

## Related ADRs

None

## Visual Evidence

- None

## References

- `./IMPLEMENTATION.md`
- `./HISTORY.md`
- `./contracts/http-apis.md`
