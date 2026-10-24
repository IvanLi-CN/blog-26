# Manual Version Release 实现状态

## Current Status

- Lifecycle: active
- Implementation: partial

已实现机器可读合同、语义版本策略、签名登记分支适配器、VERSION-only PR 准备、main 完成事件核验、冻结输入与两种产物、GitHub Release/GHCR 发布及 EdgeOne 恢复链路。版本端点分开返回产品版本、构建身份和来源。

冻结公开快照时，请求状态和完整响应体读取共享同一重试边界；响应体在临时内存响应中完整读取后才交给快照校验，读取中途的超时或连接重置会按既有退避策略重新请求。Bun transport 重试耗尽后，快照和媒体冻结会使用 curl 的 HTTPS-only HTTP/1.1、禁用压缩 fallback；快照完整缓冲响应，媒体在读取期间执行大小上限并在超限时终止 curl，同时保留状态、响应头、同源重定向和媒体大小限制。该修复不改变公开快照 URL、外部公开合同或发布输入契约。

当前候选实现采用 `product-semver-v1`，支持 stable/alpha/beta/rc 快捷值及完整 SemVer，使用精确整数排序、独立正式语义基线与占用下界。原请求纳入不可变身份，预发布完成要求两种产物证明、生产指针前后读回一致，以及部署/latest 的不适用结果。预发布部署与晋升入口分别拒绝请求，工作流将部署密钥限制在正式发布步骤。Agent VM 全量钩子通过 `867` 个测试和 `3840` 个断言；同步主干恢复修复后，登记、快照获取和恢复的 `21` 个针对性测试通过。stable、alpha、beta、rc 的非生产两产品 smoke 在平台运行中取得过成功证据；最终候选的当前 Actions、审查、实现 PR 合并和真实 alpha 发布仍待完成。

## Requirements Intake

已确认：唯一 `version` 文本输入；留空或 stable 自动正式版；alpha/beta/rc 自动预发布；完整版本精确指定；预发布只发布两种产物，不部署站点或推进正式 latest。正式语义基线与已占用下界分别计算，同目标的预发布阶段向前且允许跳过；阶段回退停止，由发版人显式指定更高完整目标。预发布完整能力必须通过获授权的真实 alpha 发布验收，正式部署需独立证据。

主人已批准实现 PR 合并及合并后一次真实 alpha 发布验收；没有未决设计问题。本轮不执行正式版部署或 beta/rc 真实发布，也不新增凭据或改变保护规则。

## Implementation Coverage

- 登记读取支持 Verified 发布机器人提交中的 `Ledger-Recovery` 声明，只认可声明明确指向的 GitHub 签名异常提交；声明本身必须通过机器人作者与签名校验，未登记的人类提交仍阻断。恢复记录可保留在祖先提交中，不需要改写远端历史。登记、来源与单一工作流输入的 18 项针对性测试通过；真实远端登记只读探针通过并核验登记提交 `387b5c6e14cf1101799c5b61ae06394e989b8739`。当前 `2.8.3` 发布身份尚未完成，alpha 验收不得替换它。
- 版本、证据、并发预留、来源和故障恢复模块有固定样例测试；完整构建和生产模式 smoke 使用非生产 fixture。
- 来源移动后的新手动准备保留废弃记录和已占用版本；原运行重跑及其他发版人不能替换旧身份。尚未绑定的 PR 也必须核验来源并关闭后才能重新准备。
- 自动合并与 main 保护规则已通过实际配置读回核验：十项 required checks、严格 up-to-date、Verified commits、管理员受约束、禁止 force/delete、零新增人工审批。
- 发布身份采用内置 `GITHUB_TOKEN` 和 GraphQL expected-head 签名提交，准备阶段显式 dispatch 确切 preparation head 的 CI/E2E；合并衔接在全部作业成功且登记身份、PR 编号、PR head 与来源未变化后，通过 Checks API 发布同一 Actions 身份创建的 PR 关联检查见证，再观察受保护的自动合并。[签名探针](https://github.com/IvanLi-CN/blog-26/actions/runs/37506548178/job/112416565449)已核验内置令牌创建的 [Verified 登记提交](https://github.com/IvanLi-CN/blog-26/commit/8e69dd5fc60966944c7869fe89ee5223bf3eb3f8)。Product Release 同时支持无输入的受控恢复 dispatch；它只从 release-ledger 解析唯一仍有效的已合并身份，复用其 merge SHA 并重新核验 main CI/E2E，不接受版本、来源或产物参数。最终候选的完整 CI、平台验收和审查证据随实现 PR 交付；生产发版由后续自动衔接或该恢复入口触发。
- Product Release failure/cancelled recovery 现在通过 `retry-product-release.yml` 以唯一 `release_id` 触发原 Product Release run rerun；恢复校验 repository、workflow path、main、原 run ID、merge SHA、未完成 stage 和 conclusion，不创建 successor identity，不复制 artifact。旧 ledger failure phase 仍可读取，新失败同时记录固定 phase、实际 step、run ID 和 attempt；成功推进会清除旧 failure。
- frozen inputs 记录后、image build 前新增 deterministic frozen-media preflight。预检只读取同一 frozen snapshot、media manifest 和 build config，生成绑定 release identity、merge SHA 与 inputs manifest digest 的静态输出证明，image build 只复用匹配证明；预检输出不是不可变产品 artifact，可在原 run rerun 中重建。
- input-only abandon 已收紧：可用 frozen inputs artifact 时明确拒绝；仅在 GitHub 已证明 artifact 缺失或过期、没有 products、人工确认 loss 且提供 incident reason 时允许紧急 abandon。无任何 artifact 的 pre-artifact failure/cancelled 仍保留原有 abandon 入口，abandoned identity 不可复活或重新分配。
- 失败通知继续使用既有 Oidrune transport，但补充 version、release identity、source/merge SHA、run URL、attempt、fixed phase、step、same-identity recovery operation 和 retry URL；Product Release 不持有通知凭据或 delivery 逻辑。
- 本修复对齐 Style Playbook 的 `manual-version-release-delivery`、`release-failure-notification` 和 `quality-gates` Topic：同 identity 恢复、失败上下文含恢复目标、生产发布仍为 post-merge gate，未改写 PR/main required checks。
- 未触发生产产品发布、部署或真实通知测试；不得把本地 fixture 和配置读回当成生产发布成功证明。

## References

- [SPEC.md](./SPEC.md)
- [HISTORY.md](./HISTORY.md)
- [运行手册](../../runbooks/manual-version-release.md)
