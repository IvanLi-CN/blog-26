# Implementation

- Lifecycle: active
- Implementation: in progress

`.github/workflows/notify-release-failure.yml` 保留手动通知 smoke test，使用固定 SHA 的 Oidrune reusable workflow、GitHub OIDC 和默认网关。

已接入 Manual Product Release / Product Release 的可信 main 失败事件。只读身份解析步骤从发布登记取得产品版本、实际来源和身份，再交给 Oidrune；未完成版本预留的准备失败明确标为 unreserved。通知失败只告警。

工作流契约测试验证固定 Oidrune 引用、独立 OIDC 权限与不传递 caller secrets。未发送真实通知测试，自动交接的现场验收待实际失败事件。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
