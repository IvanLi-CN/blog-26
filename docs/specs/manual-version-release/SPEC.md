# Manual Version Release

## Context and Scope

本主题定义产品的手动版本发布合同。发布产物固定为静态前台和完整功能 Docker 镜像；版本准备、受保护 PR 合并、实际发布和失败恢复属于同一合同。

## Terms and Interfaces

- 产品版本：两种产物共享的 SemVer 版本。
- 产品版本请求：一次发布的输入意图，可要求系统自动分配正式版或预发布版本，也可指定完整产品版本。
- Version Policy：校验版本格式、自动递增、单调性、可信基线、预留、冲突与恢复的独立策略。
- 发布身份：产品版本、来源提交、策略、预留及产物校验值的绑定。
- 入口：从 main 发起一次 `workflow_dispatch`；唯一自定义输入 `version` 是可选文本。
- 输入值：留空或 `stable` 表示自动正式版；`alpha`、`beta`、`rc` 表示对应阶段自动分配；完整产品版本表示向前的精确指定。
- 产品预发布：产品版本包含预发布标识的统一产品发布，包含 alpha、beta、rc；发布两种产物，不部署站点或推进正式 latest。
- 正式语义基线：可信已发布正式产品版本及其来源，用于计算整个待发布区间的兼容性升级要求。
- 已占用版本下界：所有已发布、预留及废弃身份的最高 SemVer 顺序，用于新身份的严格向前分配；与正式语义基线分别计算。
- 版本文件：根目录 `VERSION`，由发布准备 PR 修改。
- 发布登记：独立 `release-ledger` 分支上的签名状态链。
- 构建身份：`productVersion`、`buildVersion`、`sourceSha`；静态 `/version.json` 和只读 `GET /api/version` 暴露相同产品版本及来源。

## Requirements

### REQ-MVR-001

系统 MUST 将静态前台和完整功能 Docker 镜像作为固定发布集合，两种产物共享同一个产品版本。

### REQ-MVR-002

版本输入留空或为 `stable` 时，系统 MUST 按 Version Policy 自动分配正式版本；输入 `alpha`、`beta`、`rc` 时 MUST 自动分配对应阶段的完整产品版本。发版人指定完整版本时，系统 MUST 验证其高于可信版本基线及全部已占用版本，并拒绝为不同发布身份复用相同版本。快捷请求解析完成后才能建立版本预留；请求值和分配结果 MUST 分别记录。

### REQ-MVR-003

一次手动 dispatch MUST 创建或复用同一次准备的发布 PR，仅修改根目录 `VERSION`，并启用 GitHub 原生自动合并。

### REQ-MVR-004

发布 PR MUST 满足 required checks、审查和分支保护规则。实际发布 MUST 绑定该 PR 的确切 merge SHA，并核对同一发布身份的质量证据。

### REQ-MVR-005

系统 MUST 在不可逆发布动作前建立持久预留，绑定产品版本、来源及策略。并发请求、重复请求和冲突请求 MUST 经过唯一身份验证，不能重复分配版本或挪用预留。

### REQ-MVR-006

两种产物均发布成功后系统才能标记产物发布完成。产品预发布的完成条件是两种产物的实际发布证明，部署和正式 latest 晋升 MUST 明确标记为不适用，MUST NOT 伪造已部署或已晋升证明；正式发布完整流程的完成条件还包括既定部署和 latest 验证。部分失败后的恢复 MUST 复用原请求、版本、来源、预留、冻结输入和产物校验值；同一身份出现不同内容时 MUST 拒绝覆盖。

### REQ-MVR-007

部署及恢复 MUST 消费同一份已验证产物。产品版本和构建标识 MUST 分别记录，使静态产物和镜像的发布来源可追溯。

### REQ-MVR-008

手动工作流 MUST 仅接受可选字符串 `version`，且仅从 main 发起。输入 MUST 支持留空、`stable`、`alpha`、`beta`、`rc` 和完整产品版本；MUST NOT 要求独立 `channel` 或 `target` 输入。最终产品版本 MUST 是完整 SemVer，快捷请求 MUST NOT 直接写入 VERSION、登记的版本、tag 或产物。正式语义基线 MUST 来自可信已发布正式产品版本及其来源，预发布 MUST NOT 取代此基线；待发布区间 MUST 覆盖基线之后的全部成员变更。自动或指定版本的主、次、补丁版本 MUST 至少达到最高 verified 影响要求的语义目标，完整版本 MUST 按 SemVer 顺序高于所有已占用版本。这两项约束 MUST 分别校验；与目标核心相同的预发布不能仅因低于该核心的正式版本而被拒绝。公开 API 与持久状态兼容性 MUST 分别保留 planned、current、verified 结论及与当前文件 blob 绑定的证据；证据缺失、过期或未覆盖时停止。

语义证据过期指可信基线、待发布变更范围、文件或验证见证 blob、公开 API 或持久状态兼容性假设发生变化，原 verified 结论不再覆盖当前来源。评估时间用于审计，不设置仅按经过天数失效的期限。

### REQ-MVR-009

预留更新 MUST 通过 GraphQL `createCommitOnBranch` 绑定登记分支旧 `expectedHeadOid`，产生唯一父提交并原子比较交换。准备 PR MUST 使用内置 `GITHUB_TOKEN` 创建 GitHub 签名、Verified、Signed-off-by 提交，并采用 squash 自动合并；主干来源移动后 MUST 阻断旧准备。关闭未合并 PR MUST 废弃预留，版本不得再次分配。

来源移动后的重新准备 MUST 由原发版人以新的手动运行发起。尚未登记 PR 的旧预留 MUST 核验不存在开放或已合并 PR，再废弃并保留记录和已占用版本；关闭但未登记的 PR MUST 核验原准备来源。原运行重跑 MUST NOT 废弃旧身份或替换来源，其他发版人 MUST NOT 接管准备。

### REQ-MVR-010

准备 MUST 显式 dispatch 确切 preparation head 的 CI/E2E；合并衔接 MUST 核验全部 PR 检查、观察受保护的自动合并并显式 dispatch 同一 merge SHA 的 main CI/E2E。发布 MUST 由 CI/E2E 的 main push 或已验证 dispatch 完成事件自动衔接，核验确切 merge SHA 的全部 main required checks。普通实现提交 MUST 跳过产品发布。PR 可取消过期运行；main 和发布评估 MUST 保留必需运行。重跑 MUST 使用原运行身份及策略。

### REQ-MVR-011

公开内容、媒体、Playbook edition、模型目录、构建配置、日期、依赖及基础镜像 digest MUST 冻结。输入和两种产物 MUST 以不可覆盖的 Actions artifact 保留 90 天。统一 tag 与资产、镜像 MUST 绑定原来源及摘要。正式发布在生产共享锁内冻结输入；两种产物均发布成功后才能将相同静态归档部署到 EdgeOne，版本、来源和 Playbook pointer 验证通过后才能推进 latest。产品预发布 MUST NOT 部署站点、推进正式 latest 或改变生产内容指针。已被更新版本取代的身份 MUST 不回退生产指针。

### REQ-MVR-013

正式版与预发布 MUST 从同一版本请求入口进入登记、VERSION-only PR、自动合并、确切来源门禁、输入冻结和两种产物发布流程。预发布的 GitHub Release MUST 标记为 prerelease，且 MUST NOT 被设为正式 latest。版本 tag 和镜像版本引用 MUST 由完整产品版本按确定、可验证且无歧义的映射生成；静态归档、镜像及发布记录 MUST 保留原始完整产品版本和相同 sourceSha。自动编号的新增发布和原运行的失败恢复 MUST 分别处理；恢复不能生成新编号或改变发布类型。

### REQ-MVR-014

预发布能力交付 MUST 包含一次获明确授权的真实 alpha 发布验收，证明机器人 Verified、Signed-off-by 的 VERSION-only PR 通过保护规则自动合并，确切 merge SHA 的 main 门禁通过，静态 GitHub Release 归档及 GHCR 完整镜像实际发布且摘要与冻结登记一致，原身份达到预发布完成状态。验收 MUST 比较发布前后的正式 GitHub latest、镜像 latest 和生产内容指针，证明它们没有变化；MUST NOT 部署生产或发送真实通知测试。仅本地构建、Candidate CI、登记签名探针或配置读回不足以证明真实发布链路完成。正式站点部署能力必须另行取得其发布与部署证据。

### REQ-MVR-015

自动分配 MUST 在语义目标允许时沿用当前尚未结束的预发布核心版本；同一目标的阶段按 alpha、beta、rc、正式版向前。各预发布阶段自动序号从 1 开始，并高于该目标同阶段的所有已占用序号，废弃序号不得复用；进入后续阶段时按该阶段尚未占用的下一序号分配。系统 MUST 允许跳过阶段及直接正式发布。若自动请求指向当前目标已越过的阶段，系统 MUST 停止并解释原因，不得自行抬高核心版本；发版人可显式指定满足语义目标且高于已占用下界的完整版本开启新目标。必要语义升级要求更高核心、或核心正式版本已被占用时，新目标分配按语义与已占用版本约束处理，不能把这类正常前进误判为阶段回退。

### REQ-MVR-016

不同完整产品版本 MUST 建立各自的新发布身份，重新经过 VERSION-only PR、确切合并来源、质量门禁及对应版本的产物验证；正式版不是预发布身份的失败恢复。预发布转换为正式版 MUST NOT 重命名既有 tag、改变既有 Release 的版本/类型或将含预发布版本及来源的静态归档或镜像字节直接标为正式版。每个身份的输入和产品只冻结一次；同身份恢复复用冻结结果，不同身份的产品版本及来源证明必须对应其自身登记。

### REQ-MVR-012

仓库 MUST 启用自动合并、main PR-only、严格 up-to-date、Verified commits、禁止 force/delete 和管理员受约束规则，不新增人工审批人数。发布身份 MUST 使用内置 `GITHUB_TOKEN` 与 `github-actions[bot]`，不得要求新增 App、私钥或 PAT。仓库 MUST 允许 Actions 创建 PR；代码 MUST NOT 调用审批接口或绕过 main 保护。准备和衔接按 job 声明必需的 contents/pull-requests/actions 权限，GHCR 采用 job 级 packages:write，默认 Actions 只读，Playbook 来源 token 独立。实际配置、机器人 Verified 提交及非生产 Candidate Actions 运行 MUST 提供验收证据。

## Verification

### VER-MVR-001

- Method: 核对一次正式发布及一次产品预发布的静态产物、Docker 镜像和发布记录。
- covers: `REQ-MVR-001`, `REQ-MVR-007`
- Pass condition: 各类发布集合只有两种产物，产品版本和来源一致；正式部署消费验证过的产物，产品预发布不部署站点。

### VER-MVR-002

- Method: 使用固定版本基线检查留空、stable、alpha、beta、rc、向前完整指定、相同版本和回溯版本。
- covers: `REQ-MVR-002`
- Pass condition: 快捷请求自动分配完整产品版本，向前指定保持调用者版本，回溯和不同身份的重复版本被拒绝；原请求与分配结果可分别核验。

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
- Pass condition: 补齐缺失产物，既有产物校验值保持一致，版本不递增；预发布完成对应两种产物实际发布成功，部署和正式 latest 晋升为不适用，正式流程完成仍要求部署与 latest 验证。

### VER-MVR-006

- Method: 运行版本策略、语义证据和登记并发固定样例测试。
- covers: `REQ-MVR-008`, `REQ-MVR-009`
- Pass condition: 最高 verified 影响决定核心版本的必要升级，完整版本按 SemVer 顺序向前；例如从 2.7.0 的 minor 目标允许 2.8.0-alpha.1，却拒绝 2.7.1-alpha.1。回溯、不足升级、证据过期、伪造准备及并发冲突被拒绝，废弃版本不复用，预发布成功不替换正式语义基线。

### VER-MVR-007

- Method: 核验完成事件、同 SHA main 检查和原运行恢复测试。
- covers: `REQ-MVR-010`, `REQ-MVR-011`
- Pass condition: 普通提交跳过、错误来源或 skipped 必需检查不能发布；静态和 OCI 产物来源一致，恢复仅补齐缺失步骤，丢失/摘要冲突阻断；预发布的部署和正式 latest 操作为不适用，较旧身份不回退生产指针。

### VER-MVR-009

- Method: 核对同一入口的正式和预发布请求、发布类型、版本映射、失败恢复及产物元数据。
- covers: `REQ-MVR-013`
- Pass condition: 快捷值不能成为最终产品版本；预发布标记与版本匹配，两种产物保留相同完整产品版本及 sourceSha，镜像版本引用映射无歧义，重跑保留原版本与发布类型并拒绝产物覆盖。

### VER-MVR-010

- Method: 在明确发版授权下执行一次真实 alpha 发布并收集 PR、签名、main 门禁、Release 资产、GHCR digest、冻结登记与生产指针对比证据。
- covers: `REQ-MVR-014`
- Pass condition: 真实 PR 自动合并，两种产物发布成功并绑定同一版本及 merge SHA，摘要与登记一致；预发布完成记录可核验，正式 latest 与生产内容指针不变；没有站点部署或真实通知测试，正式部署未由 alpha 成功推定为已验收。

### VER-MVR-011

- Method: 使用可信正式基线 2.7.0 和 verified minor，检查自动 alpha、重复新 alpha、beta、rc、正式版、跳过阶段、废弃序号及较高语义目标样例。
- covers: `REQ-MVR-015`
- Pass condition: 正常请求产生 2.8.0-alpha.1、2.8.0-alpha.2、2.8.0-beta.1、2.8.0-rc.1、2.8.0；允许跳过阶段；同目标 beta 后 alpha 和 rc 后 beta 被拒绝；向前的显式 2.9.0-alpha.1 可以开启新目标，废弃序号不复用；verified major 将必要核心提升到 3.0.0。

### VER-MVR-012

- Method: 核对一次预发布到正式版的新请求及原预发布失败重跑的 PR、登记、版本元数据与产物来源。
- covers: `REQ-MVR-016`
- Pass condition: 正式版具有独立 PR、版本、来源及验证过的产物，原预发布 tag/Release/产品字节不变；原运行重试仍保留原请求、版本、来源、输入和摘要，不被解释为阶段晋升。

### VER-MVR-008

- Method: 读回实际仓库配置，并执行 Candidate 非生产 Actions 与内置令牌签名提交探针。
- covers: `REQ-MVR-012`
- Pass condition: 保护设置与合同一致、默认令牌只读、写权限限定必要 job、无分支保护绕过，机器人提交 Verified，必需评估完整保留；不投放生产测试产物。

## Related ADRs

- [ADR 0014](../../adr/0014-unified-product-release-version-scope.md)
- [ADR 0015](../../adr/0015-manual-version-release-delivery.md)
- [ADR 0016](../../adr/0016-signed-release-ledger-and-frozen-products.md)
- [ADR 0017](../../adr/0017-product-prerelease-publication-boundary.md)
- [ADR 0018](../../adr/0018-product-prerelease-version-allocation.md)

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [实现状态](./IMPLEMENTATION.md)
- [主题记录](./HISTORY.md)
