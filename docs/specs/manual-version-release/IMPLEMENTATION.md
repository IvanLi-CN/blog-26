# Manual Version Release 实现状态

## Current Status

- Lifecycle: active
- Implementation: partial

已实现机器可读合同、语义版本策略、签名登记分支适配器、VERSION-only PR 准备、main 完成事件核验、冻结输入与两种产物、GitHub Release/GHCR 发布及 EdgeOne 恢复链路。版本端点分开返回产品版本、构建身份和来源。

当前候选实现采用 `product-semver-v1`，支持 stable/alpha/beta/rc 快捷值及完整 SemVer，使用精确整数排序、独立正式语义基线与占用下界。原请求纳入不可变身份，预发布完成要求两种产物证明、生产指针前后读回一致，以及部署/latest 的不适用结果。预发布部署与晋升入口分别拒绝请求，工作流将部署密钥限制在正式发布步骤。`837` 个测试和 `3707` 个断言已通过，稳定版与 alpha 两种非生产两产品 smoke 也已通过；候选 Actions、实现 PR 合并和真实 alpha 发布仍待取得平台证据。

## Requirements Intake

已确认：唯一 `version` 文本输入；留空或 stable 自动正式版；alpha/beta/rc 自动预发布；完整版本精确指定；预发布只发布两种产物，不部署站点或推进正式 latest。正式语义基线与已占用下界分别计算，同目标的预发布阶段向前且允许跳过；阶段回退停止，由发版人显式指定更高完整目标。预发布完整能力必须通过获授权的真实 alpha 发布验收，正式部署需独立证据。

主人已批准实现 PR 合并及合并后一次真实 alpha 发布验收；没有未决设计问题。本轮不执行正式版部署或 beta/rc 真实发布，也不新增凭据或改变保护规则。

## Implementation Coverage

- 版本、证据、并发预留、来源和故障恢复模块有固定样例测试；完整构建和生产模式 smoke 使用非生产 fixture。
- 来源移动后的新手动准备保留废弃记录和已占用版本；原运行重跑及其他发版人不能替换旧身份。尚未绑定的 PR 也必须核验来源并关闭后才能重新准备。
- 自动合并与 main 保护规则已通过实际配置读回核验：十项 required checks、严格 up-to-date、Verified commits、管理员受约束、禁止 force/delete、零新增人工审批。
- 发布身份采用内置 `GITHUB_TOKEN` 和 GraphQL expected-head 签名提交，准备与合并衔接显式 dispatch CI/E2E。[签名探针](https://github.com/IvanLi-CN/blog-26/actions/runs/37506548178/job/112416565449)已核验内置令牌创建的 [Verified 登记提交](https://github.com/IvanLi-CN/blog-26/commit/8e69dd5fc60966944c7869fe89ee5223bf3eb3f8)。最终候选的完整 CI、平台验收和审查证据随实现 PR 交付；生产发版由后续手动触发。
- 未触发生产产品发布、部署或真实通知测试；不得把本地 fixture 和配置读回当成生产发布成功证明。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
- [运行手册](../../runbooks/manual-version-release.md)
