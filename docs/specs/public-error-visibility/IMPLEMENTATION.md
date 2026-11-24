# 访客可见错误的过滤与预设 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实，避免这些细节散落到 PR / Git 历史里。

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: 错误预设与各出口接入已落地，等评审。

## Implementation Coverage

- `REQ-PERR-001`、`REQ-PERR-002`、`REQ-PERR-003`：`src/lib/public-error-presets.ts` 定义封闭码集合与七类语义预设，未登记码按状态兜底。
- 出口接入：`src/server/public-api/router.ts` 的 `json()` 与 SSE `error` 事件、`src/server/assistant/api.ts` 的 `response()`、`src/server/clipping/api.ts` 的 `response()`、`src/server/files-api/router.ts` 的 `json()`、`src/server/public-api/playbook.ts` 的错误分支。
- `REQ-PERR-004`：公开接口的 zod 失败统一压成 `INVALID_REQUEST` 预设，issue 细节不再出现在访客载荷。
- `REQ-PERR-005`：`src/server/trpc.ts` 固定 `isDev: false`，错误形状只保留预设文案、公开码、状态与错误标识。
- `REQ-PERR-006`：`buildPublicErrorBody` 生成 `err_<10 hex>`，并以同一标识写入服务端日志。
- `REQ-PERR-007`：`site/components/KnowledgeAssistant.tsx`、`site/components/SearchPageIsland.tsx`、`site/components/PublicMemoAuthoring.tsx`、`src/components/search/PublicSearchPage.tsx`、`src/components/comments/hooks.ts` 的兜底不再渲染响应原文。
- `REQ-PERR-008`：`/api/admin/*` 的形状与 `details` 未改动，仅新增 `errorRef`。
- Verification commands: `bun test tests/lib/public-error-presets.test.ts`、`bun test src/server/public-api`、`bun test src/server/http-compat-api.test.ts`、`bun test src/server/clipping`。
- Rollout facts: 断言原始错误文本的用例已改为断言公开码或预设文案：`search-stream.test.ts`、`assistant-chat.test.ts`、`http-compat-api.test.ts`、`clipping/service.test.ts`。

## Coverage / rollout summary

- 剪藏存储的失败文案改为预设，原始异常只留在日志；`SAFE_GENERATION_ERROR_CODES` 保留为回合状态码，不再作为访客文案。

## Remaining Gaps

- 无未实现需求。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
- `./contracts/http-apis.md`
