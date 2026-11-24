# HTTP 错误载荷契约（非管理端与管理员端）

本文件定义 [访客可见错误的过滤与预设](../SPEC.md) 的对外形状。管理端错误载荷沿用既有形状，只追加 `errorRef`。

## 访客载荷

- 形状：`{ "error": string, "code"?: string, "errorRef": string }`，保持扁平，`error` 仍是单个字符串，兼容既有读取方。
- `error`：只允许是该码对应预设文案。
- `code`：封闭集合内的公开码；未登记码在出口处替换为 `INTERNAL_ERROR`。
- `errorRef`：`err_` 加 10 位小写十六进制，单次失败唯一，同时写入服务端日志。
- 禁止字段：`details`、`zodError`、`stack`、`path`、`cause`。

Assembled example:

```json
{
  "error": "请求参数不合法，请检查后重试。",
  "code": "INVALID_REQUEST",
  "errorRef": "err_3f9a1c07b2"
}
```

## 管理员载荷

- 形状：`{ "error": { "code": string, "message": string, "details"?: unknown }, "errorRef": string }`。
- `message` 保持原始技术消息；`details` 保持 Zod issue 序列化；不新增截断。

## 状态类

| Kind | 含义 | 默认文案 |
| --- | --- | --- |
| `network` | 客户端未能建立或完成请求 | 网络连接中断，请检查网络后重试。 |
| `unauthenticated` | 需要登录 | 请先登录后再继续操作。 |
| `forbidden` | 已登录但无权限 | 当前账号没有执行该操作的权限。 |
| `invalid-request` | 输入、语法或版本前置条件不成立 | 请求参数不合法，请检查后重试。 |
| `not-found` | 目标内容不存在或已不可用 | 目标内容不存在或已不可用。 |
| `unavailable` | 功能未开放或服务暂不可用 | 该功能暂不可用，请稍后重试。 |
| `rate-limited` | 触发频率或个人配额限制 | 操作过于频繁，请稍后再试。 |

## 公开码到状态类

| Code | HTTP | Kind | 访客文案 |
| --- | --- | --- | --- |
| `NETWORK_ERROR` | 0 | `network` | 网络连接中断，请检查网络后重试。 |
| `UNAUTHORIZED` | 401 | `unauthenticated` | 请先登录后再继续操作。 |
| `FORBIDDEN` | 403 | `forbidden` | 当前账号没有执行该操作的权限。 |
| `INVALID_REQUEST` | 400 | `invalid-request` | 请求参数不合法，请检查后重试。 |
| `CONFLICT` | 409 | `invalid-request` | 当前状态已变化，请刷新后重试。 |
| `NOT_FOUND` | 404 | `not-found` | 目标内容不存在或已不可用。 |
| `GONE` | 410 | `not-found` | 目标内容已不可用。 |
| `FEATURE_DISABLED` | 404 | `unavailable` | 该功能当前未开放。 |
| `RATE_LIMITED` | 429 | `rate-limited` | 操作过于频繁，请稍后再试。 |
| `QUOTA_EXCEEDED` | 429 | `rate-limited` | 本次额度已用完，请稍后再试。 |
| `SERVICE_UNAVAILABLE` | 503 | `unavailable` | 服务暂不可用，请稍后重试。 |
| `INTERNAL_ERROR` | 500 | `unavailable` | 服务处理失败，请稍后重试。 |

未登记码的处理：按响应状态映射到上表 HTTP 列对应的码，再取该码文案；状态无法映射时使用 `INTERNAL_ERROR`。

## 现有码的迁移

| 现状 | 迁移后 |
| --- | --- |
| tRPC 默认 `message`（如 `FORBIDDEN`）作为文案 | `code: "FORBIDDEN"`，文案取上表 |
| Zod issue 转储作为 `message` | `code: "INVALID_REQUEST"`，无 issue 文本 |
| `unsupported-parameter`、`query-budget-exceeded` 等内部 kebab 标记 | `code: "INVALID_REQUEST"` 或 `code: "RATE_LIMITED"`，kebab 标记只留在日志 |
| `search-unavailable`、`search-index-query-failed` | `code: "SERVICE_UNAVAILABLE"` |
| `GitHub reader OAuth is not configured` | `code: "FEATURE_DISABLED"` |
| 剪藏错误类白名单原文 | 各错误类映射到 `INVALID_REQUEST` 或 `SERVICE_UNAVAILABLE`，原文留在日志 |
| 助手 `SAFE_GENERATION_ERROR_CODES` 原码 | 生成失败统一 `code: "INTERNAL_ERROR"`；`generation-failed` 只作为回合状态，不作访客文案 |

## 兼容性

- 形状兼容：`error` 仍为字符串，`code` 仍为可选字符串；新增 `errorRef` 为纯增量。
- 行为不兼容：原先断言错误原文的用例与客户端分支必须改为断言公开码或预设文案。
- 助手客户端的未知码分支必须改为读取预设，不再读取 `message`。

## 迁移顺序

1. 建立封闭码集合与预设表。
2. 在出口装配层接入映射，先让未登记码走兜底。
3. 逐出口移除原文透传，并补 `errorRef` 与日志关联。
4. 收敛剪藏与助手的两处白名单为已登记码。
5. 修正访客界面的 `error.message` 兜底路径。
