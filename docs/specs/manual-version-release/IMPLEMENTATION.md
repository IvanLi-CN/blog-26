# Manual Version Release 实现状态

## Current Status

- Lifecycle: active
- Implementation: in progress

已实现机器可读合同、语义版本策略、签名登记分支适配器、VERSION-only PR 准备、main 完成事件核验、冻结输入与两种产物、GitHub Release/GHCR 发布及 EdgeOne 恢复链路。版本端点分开返回产品版本、构建身份和来源。

## Implementation Coverage

- 版本、证据、并发预留、来源和故障恢复模块有固定样例测试；完整构建和生产模式 smoke 使用非生产 fixture。
- 自动合并与 main 保护规则已通过实际配置读回核验：十项 required checks、严格 up-to-date、Verified commits、管理员受约束、禁止 force/delete、零新增人工审批。
- 发布身份采用内置 `GITHUB_TOKEN` 和 GraphQL expected-head 签名提交，准备与合并衔接显式 dispatch CI/E2E。实际机器人 Verified 提交及 Candidate Actions 平台验收尚待执行。
- 未触发生产产品发布、部署或真实通知测试；不得把本地 fixture 和配置读回当成生产发布成功证明。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
- [运行手册](../../runbooks/manual-version-release.md)
