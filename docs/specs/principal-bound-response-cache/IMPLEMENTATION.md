# 主体绑定响应的缓存边界 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实，避免这些细节散落到 PR / Git 历史里。

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: 生产网关默认私有策略已落地，等评审。

## Implementation Coverage

- `REQ-PBC-001`、`REQ-PBC-002`、`REQ-PBC-003`：`src/lib/response-cache-policy.ts` 提供 `applyPrivateResponseDefaults`；`scripts/start-gateway.ts` 把原 `fetch` 主体抽为 `handleGatewayRequest`，统一在返回前应用默认头，handler 已设置的 `cache-control` 保持不变。
- `REQ-PBC-004`：`/api/*` 与 `/_internal/*` 全部继承默认私有；`/api/public/assets/*`、`/api/public/runtime-config`、`/api/version` 的显式缓存头保留。
- `REQ-PBC-005`：`tests/lib/response-cache-policy.test.ts` 覆盖默认私有、显式头优先、非 API 路径不改写、状态与 body 保留。
- Verification commands: `bun test tests/lib/response-cache-policy.test.ts`；本地以 `PORT=25890` 启动生产网关实测 `/api/public/memos` 返回 `private, no-store` + `vary` + `x-robots-tag`，`/api/version` 保持自身 `no-store`。
- Rollout facts: console 构建的 `site/middleware.ts` 策略未改动，两条路径现在语义一致。

## Coverage / rollout summary

- 生产网关的 API 分支不再原样返回未声明的响应。

## Remaining Gaps

- 无未实现需求；为身份无关接口选择具体缓存时长仍按规范属于本主题范围之外。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
