# Release 失败 Oidrune 告警接入

## Context and Scope

本主题定义产品发布失败的通知合同，使用固定版本的 Oidrune reusable workflow 和 GitHub OIDC 认证。

## Requirements

### REQ-RFA-001

系统 MUST 将已确认的产品发布失败交给 Oidrune 通知流程，并记录产品版本、实际发布来源 SHA、workflow run URL 和运行次数。

### REQ-RFA-002

通知调用 MUST 仅使用 GitHub OIDC 所需的 `id-token: write` 权限和 Oidrune 默认网关，通知交接失败 MUST 报告警告而不能改变产品发布结果。

### REQ-RFA-003

系统 MUST 保留 `workflow_dispatch` 通知 smoke test，以独立核对通知链路。

## Verification

### VER-RFA-001

- Method: 核对失败发布的通知摘要和相同发布身份。
- covers: `REQ-RFA-001`
- Pass condition: 摘要中的产品版本、来源 SHA、run URL 和运行次数对应失败的实际发布。

### VER-RFA-002

- Method: 检查固定 reusable workflow 引用、调用权限及网关失败处理。
- covers: `REQ-RFA-002`
- Pass condition: 仅授予 `id-token: write`，网关失败只影响通知交接结果。

### VER-RFA-003

- Method: 显式触发手动通知 smoke test，并核对对应运行摘要。
- covers: `REQ-RFA-003`
- Pass condition: 通知明确标为 smoke test，运行身份可追溯。

## Related ADRs

None

## References

- [实现状态](./IMPLEMENTATION.md)
- [主题记录](./HISTORY.md)
