# Release 失败 Oidrune 告警接入

## Summary
- 为 `Release (PR Label Driven)` 工作流补一个 repo-local notifier wrapper，统一复用 Oidrune 通知 workflow。
- 为 release 目标 SHA 增加显式日志标记，确保失败告警能定位真实 release target。
- 接入后通过 `workflow_dispatch` smoke test 验证 OIDC-authenticated 通知链路。

## Scope
- 新增 `.github/workflows/notify-release-failure.yml`。
- 更新 `.github/workflows/release.yml` 输出 `RELEASE_REQUESTED_SHA` / `RELEASE_TARGET_SHA` 标记。
- 以固定发布 SHA 调用 `IvanLi-CN/oidrune/.github/workflows/notify.yml`，并使用其默认网关。
- 保持现有发布逻辑与 artifact 行为不变。

## Acceptance
- `workflow_run` 在 `Release (PR Label Driven)` 失败时触发 Oidrune 通知。
- `workflow_dispatch` 可手动发送 smoke test 通知。
- 调用 job 仅授予 `id-token: write`，不需要 Telegram 或 Shoutrrr secret。
- 默认网关 handoff 失败只警告，不改变已完成的 release 结果。
- 失败告警优先携带真实 release target SHA，而不是仅回退到 workflow 头 SHA。
