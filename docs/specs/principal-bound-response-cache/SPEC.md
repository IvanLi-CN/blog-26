# 主体绑定响应的缓存边界

> 本文件是长期需求契约；当前实现事实记录在 `IMPLEMENTATION.md`，生命周期与变更引用记录在 `HISTORY.md`。

## Context and Scope

- Context: 生产网关直接调用 API handler 并原样返回其 `Response`，没有统一的响应头后处理。因此，凡是响应体随请求身份变化的接口（管理员可读草稿 Memo、表头草稿标记、读者本人评论、个人助手对话、私人剪藏讨论、配额）在缺少缓存头时可能被共享缓存保存并回放给另一身份。console 构建的 Astro middleware 已有默认私有策略，生产路径没有对应实现。
- In scope: `/api/*` 与 `/_internal/*` 的生产响应头默认值；主体绑定响应的私有性声明；显式缓存头的保留规则；`vary` 与 `x-robots-tag` 的一致性；覆盖范围的回归。
- Out of scope: 给身份无关的公开读接口选择具体 `max-age` 或 `stale-while-revalidate` 数值；CDN 供应商配置；错误载荷分级（见 [public-error-visibility](../public-error-visibility/SPEC.md)）；内容可见性规则本身。

## Terms and Interfaces

- `主体绑定响应`：响应体的内容取决于发起请求的身份或会话的响应；它不等于“管理端响应”，普通用户的个人对话、草稿与配额同样属于主体绑定响应。
- `身份无关响应`：同一 URL 在不考虑请求身份时返回相同内容的响应，例如已发布文章列表、公开搜索、不可变媒体资产。
- 权威默认策略已存在于 console 构建的 Astro middleware；本主题要求把它补齐到生产网关，不新增第二套策略语义。

## Requirements

### REQ-PBC-001 — 生产路径必须具备默认私有策略

- 生产网关 MUST 对 `/api/*` 与 `/_internal/*` 的响应应用默认 `cache-control: private, no-store`。
- 该默认 MUST 独立于构建目标与部署环境生效，不得只在 console 构建或开发服务器中生效。
- 默认策略 MUST NOT 依赖每个 handler 自觉设置头部。

### REQ-PBC-002 — 显式缓存头优先

- handler 已设置 `cache-control` 时，系统 MUST 保留其值，不得被默认策略覆盖。
- 身份无关的可缓存资源（不可变媒体资产、运行时配置、Playbook 索引）MUST 保持其既有显式缓存策略。
- 该规则 MUST 使“新增主体绑定接口忘记声明头部”退化为默认私有，而不是默认可缓存。

### REQ-PBC-003 — 默认私有必须同时声明分键与索引策略

- 默认策略 MUST 同时设置 `vary: cookie, authorization`。
- 默认策略 MUST 同时设置 `x-robots-tag: noindex, nofollow`，与 console 路径保持一致。
- 系统 MUST NOT 在生产路径与 console 路径对同一类响应给出不同的缓存语义。

### REQ-PBC-004 — 主体绑定响应不得缺少私有声明

- 现有读取请求身份并据此裁剪内容的公开接口 MUST 在修复后返回 `private, no-store`。
- 该集合至少包括公开 Memo 列表与详情、标签时间线、reactions、`/api/health`、`/api/trpc/*`，以及全部按用户私有的写入与读取路径。
- 声明 MUST NOT 只覆盖 `GET`；同一资源的状态变更响应同样 MUST 不可被共享缓存保存。

### REQ-PBC-005 — 边界必须可回归验证

- 系统 MUST 提供自动化用例，对生产网关的 API 响应断言默认头存在，并对显式可缓存资源断言其头部未被覆盖。
- 用例 MUST 覆盖至少一个主体绑定接口与一个身份无关可缓存资源。

## Verification

### VER-PBC-001

- Method: 以生产构建启动网关，请求一个未显式设置缓存头的 API 路径，读取响应头。
- covers: `REQ-PBC-001`
- Pass condition: 响应含 `cache-control: private, no-store`，且不依赖 `NODE_ENV` 或构建目标。

### VER-PBC-002

- Method: 请求公开不可变媒体资产与运行时配置，比对响应头。
- covers: `REQ-PBC-002`
- Pass condition: 资产仍为 `public, max-age=31536000, immutable`，运行时配置仍为 `public, max-age=30`。

### VER-PBC-003

- Method: 对同一路径分别经生产网关与 console 构建取得响应，比对缓存相关头。
- covers: `REQ-PBC-003`
- Pass condition: `cache-control`、`vary`、`x-robots-tag` 三者在两条路径上语义一致。

### VER-PBC-004

- Method: 逐一请求主体绑定接口清单，断言响应头；包含至少一个非 `GET` 方法。
- covers: `REQ-PBC-004`
- Pass condition: 全部返回 `private, no-store`，且非 `GET` 响应同样不缺失。

### VER-PBC-005

- Method: 运行新增的网关响应头用例套件。
- covers: `REQ-PBC-005`
- Pass condition: 主体绑定接口与可缓存资源两类断言均通过；移除默认策略后套件失败。

## Related ADRs

None

## Visual Evidence

- None

## References

- `./IMPLEMENTATION.md`
- `./HISTORY.md`
- [访客可见错误的过滤与预设](../public-error-visibility/SPEC.md)
