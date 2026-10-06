# Manual Version Release

## Context and Scope

本主题定义产品的手动版本发布合同。发布产物固定为静态前台和完整功能 Docker 镜像；版本准备、受保护 PR 合并、实际发布和失败恢复属于同一合同。

## Terms and Interfaces

- 产品版本：两种产物共享的 SemVer 版本。
- Version Policy：校验版本格式、自动递增、单调性、可信基线、预留、冲突与恢复的独立策略。
- 发布身份：产品版本、来源提交、策略、预留及产物校验值的绑定。
- 入口：一次 `workflow_dispatch`；产品版本为可选输入。
- 版本文件：根目录 `VERSION`，由发布准备 PR 修改。
- 发布登记：独立 `release-ledger` 分支上的签名状态链。
- 构建身份：`productVersion`、`buildVersion`、`sourceSha`；静态 `/version.json` 和只读 `GET /api/version` 暴露相同产品版本及来源。

## Requirements

### REQ-MVR-001

系统 MUST 将静态前台和完整功能 Docker 镜像作为固定发布集合，两种产物共享同一个产品版本。

### REQ-MVR-002

版本输入留空时，系统 MUST 按 Version Policy 自动递增。发版人指定版本时，系统 MUST 验证其高于可信版本基线及有效预留，并拒绝为不同发布身份复用相同版本。

### REQ-MVR-003

一次手动 dispatch MUST 创建或复用同一次准备的发布 PR，仅修改根目录 `VERSION`，并启用 GitHub 原生自动合并。

### REQ-MVR-004

发布 PR MUST 满足 required checks、审查和分支保护规则。实际发布 MUST 绑定该 PR 的确切 merge SHA，并核对同一发布身份的质量证据。

### REQ-MVR-005

系统 MUST 在不可逆发布动作前建立持久预留，绑定产品版本、来源及策略。并发请求、重复请求和冲突请求 MUST 经过唯一身份验证，不能重复分配版本或挪用预留。

### REQ-MVR-006

两种产物均发布成功后系统才能标记发布完成。部分失败后的恢复 MUST 复用原版本、来源、预留、冻结输入和产物校验值；同一身份出现不同内容时 MUST 拒绝覆盖。

### REQ-MVR-007

部署及恢复 MUST 消费同一份已验证产物。产品版本和构建标识 MUST 分别记录，使静态产物和镜像的发布来源可追溯。

### REQ-MVR-008

手动工作流 MUST 仅接受可选字符串 `version`，且仅从 main 发起。规范版本为 `X.Y.Z`；预发布和构建元数据不属于产品版本。自动版本 MUST 满足整个待发布区间最高 verified 影响的必要升级，并高于所有已占用版本。指定版本 MUST 同时满足这两项约束。公开 API 与持久状态兼容性 MUST 分别保留 planned、current、verified 结论及与当前文件 blob 绑定的证据；证据缺失、过期或未覆盖时停止。

### REQ-MVR-009

预留更新 MUST 通过 GraphQL `createCommitOnBranch` 绑定登记分支旧 `expectedHeadOid`，产生唯一父提交并原子比较交换。准备 PR MUST 使用内置 `GITHUB_TOKEN` 创建 GitHub 签名、Verified、Signed-off-by 提交，并采用 squash 自动合并；主干来源移动后 MUST 阻断旧准备。关闭未合并 PR MUST 废弃预留，版本不得再次分配。

来源移动后的重新准备 MUST 由原发版人以新的手动运行发起。尚未登记 PR 的旧预留 MUST 核验不存在开放或已合并 PR，再废弃并保留记录和已占用版本；关闭但未登记的 PR MUST 核验原准备来源。原运行重跑 MUST NOT 废弃旧身份或替换来源，其他发版人 MUST NOT 接管准备。

### REQ-MVR-010

准备 MUST 显式 dispatch 确切 preparation head 的 CI/E2E；合并衔接 MUST 核验全部 PR 检查、观察受保护的自动合并并显式 dispatch 同一 merge SHA 的 main CI/E2E。发布 MUST 由 CI/E2E 的 main push 或已验证 dispatch 完成事件自动衔接，核验确切 merge SHA 的全部 main required checks。普通实现提交 MUST 跳过产品发布。PR 可取消过期运行；main 和发布评估 MUST 保留必需运行。重跑 MUST 使用原运行身份及策略。

### REQ-MVR-011

公开内容、媒体、Playbook edition、模型目录、构建配置、日期、依赖及基础镜像 digest MUST 在生产共享锁内冻结。输入和两种产物 MUST 以不可覆盖的 Actions artifact 保留 90 天。统一 tag 与资产、镜像 MUST 绑定原来源及摘要；两种产物均发布成功后才能将相同静态归档部署到 EdgeOne。版本、来源和 Playbook pointer 验证通过后才能推进 latest。已被更新版本取代的身份 MUST 不回退生产指针。

### REQ-MVR-012

仓库 MUST 启用自动合并、main PR-only、严格 up-to-date、Verified commits、禁止 force/delete 和管理员受约束规则，不新增人工审批人数。发布身份 MUST 使用内置 `GITHUB_TOKEN` 与 `github-actions[bot]`，不得要求新增 App、私钥或 PAT。仓库 MUST 允许 Actions 创建 PR；代码 MUST NOT 调用审批接口或绕过 main 保护。准备和衔接按 job 声明必需的 contents/pull-requests/actions 权限，GHCR 采用 job 级 packages:write，默认 Actions 只读，Playbook 来源 token 独立。实际配置、机器人 Verified 提交及非生产 Candidate Actions 运行 MUST 提供验收证据。

## Verification

### VER-MVR-001

- Method: 核对一次完整发布的静态产物、Docker 镜像和发布记录。
- covers: `REQ-MVR-001`, `REQ-MVR-007`
- Pass condition: 发布集合只有两种产物，产品版本和来源一致，部署消费验证过的产物。

### VER-MVR-002

- Method: 使用固定版本基线检查留空输入、向前指定、相同版本和回溯版本。
- covers: `REQ-MVR-002`
- Pass condition: 留空自动递增，向前指定保持调用者版本，回溯和不同身份的重复版本被拒绝。

### VER-MVR-003

- Method: 核对单次 dispatch 生成的 PR 差异、auto-merge 状态及合并证据。
- covers: `REQ-MVR-003`, `REQ-MVR-004`
- Pass condition: PR 只修改 `VERSION`，满足保护规则后自动合并，实际发布绑定该 merge SHA。

### VER-MVR-004

- Method: 对同一候选版本执行并发准备、重复准备和来源冲突样例。
- covers: `REQ-MVR-005`
- Pass condition: 只有一个有效发布身份和预留；冲突不能产生发布副作用。

### VER-MVR-005

- Method: 在部分发布完成后模拟失败，并使用同一发布身份恢复。
- covers: `REQ-MVR-006`
- Pass condition: 补齐缺失产物，既有产物校验值保持一致，版本不递增，完成状态对应两种产物实际发布成功。

### VER-MVR-006

- Method: 运行版本策略、语义证据和登记并发固定样例测试。
- covers: `REQ-MVR-008`, `REQ-MVR-009`
- Pass condition: 最高 verified 影响决定必要升级，回溯、不足升级、证据过期、伪造准备及并发冲突被拒绝，废弃版本不复用。

### VER-MVR-007

- Method: 核验完成事件、同 SHA main 检查和原运行恢复测试。
- covers: `REQ-MVR-010`, `REQ-MVR-011`
- Pass condition: 普通提交跳过、错误来源或 skipped 检查不能发布；静态和 OCI 产物来源一致，恢复仅补齐缺失步骤，丢失/摘要冲突阻断，较旧身份不回退生产指针。

### VER-MVR-008

- Method: 读回实际仓库配置，并执行 Candidate 非生产 Actions 与内置令牌签名提交探针。
- covers: `REQ-MVR-012`
- Pass condition: 保护设置与合同一致、默认令牌只读、写权限限定必要 job、无分支保护绕过，机器人提交 Verified，必需评估完整保留；不投放生产测试产物。

## Related ADRs

- [ADR 0014](../../adr/0014-unified-product-release-version-scope.md)
- [ADR 0015](../../adr/0015-manual-version-release-delivery.md)
- [ADR 0016](../../adr/0016-signed-release-ledger-and-frozen-products.md)

## References

- [实现状态](./IMPLEMENTATION.md)
- [主题记录](./HISTORY.md)
