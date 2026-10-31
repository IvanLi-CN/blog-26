# Manual Version Release

## Context and Scope

本主题定义产品的手动版本发布合同。发布产物固定为静态前台和完整功能 Docker 镜像；版本准备、受保护 PR 合并、实际发布和失败恢复属于同一合同。

## Terms and Interfaces

- 产品版本：两种产物共享的 SemVer 版本。
- 产品版本请求：一次发布的输入意图，可要求系统自动分配正式版或预发布版本，也可指定完整产品版本。
- Version Policy：校验版本格式、自动递增、单调性、可信基线、预留、冲突与恢复的独立策略。
- 发布身份：产品版本、来源提交、策略、预留及产物校验值的绑定。
- 入口：从 main 发起一次 `workflow_dispatch`；`.github/workflows/manual-product-release.yml` 是唯一的版本准备入口，唯一自定义输入 `version` 是可选文本；`.github/workflows/product-release.yml` 默认消费已登记的发布身份，并提供无输入恢复入口，从登记分支自动解析唯一仍有效的已合并身份，不接受版本、来源或产物参数。
- 输入值：留空或 `stable` 表示自动正式版；`alpha`、`beta`、`rc` 表示对应阶段自动分配；完整产品版本表示向前的精确指定。
- 产品预发布：产品版本包含预发布标识的统一产品发布，包含 alpha、beta、rc；发布两种产物，不部署站点或推进正式 latest。
- 正式语义基线：可信已发布正式产品版本及其来源，用于计算整个待发布区间的兼容性升级要求。
- 已占用版本下界：所有已发布、预留及废弃身份的最高 SemVer 顺序，用于新身份的严格向前分配；与正式语义基线分别计算。
- 版本文件：根目录 `VERSION`，由发布准备 PR 修改。
- 发布登记：独立 `release-ledger` 分支上的签名状态链。
- Ledger recovery marker：签名登记提交中的每一个 `Ledger-Recovery` marker 都必须是合法 SHA、指向被实际遍历到的单父链提交的严格祖先，并沿 wrapper 链最终绑定到 owner-authored、GitHub Verified 且带机器人 Signed-off-by 的历史提交；中间的 bot-authored recovery wrapper 可保留在单父链中，但不得被当作 legacy head。当前 head 到所选 legacy target 之间的多个 marker 必须收敛到同一 owner lineage；同一提交的多个 marker、该 active lineage 中彼此断开的 marker、缺失、非祖先、冲突或格式错误的 marker 必须 fail closed；legacy target 之后的历史 marker 仍须逐一验证，但不改变当前 recovery identity；bootstrap 祖先链之外的提交不属于 ledger marker 输入。
- Bootstrap recovery workflow 在写入不可变 `Ledger-Recovery` marker 前 MUST 核验输入 target 等于读取器发现的当前 owner-authored legacy identity，且该 identity 存在于当前 `release-ledger` 的 root-bound 单父祖先链、为 `web-flow` 提交、GitHub Verified 且带机器人 Signed-off-by；target 不存在、未发现 legacy identity、越过 bootstrap root、链含 merge commit 或签名/作者不符合时 MUST 在写入前 fail closed。读取器 MUST 校验 bootstrap root 和当前 head 的 `ledger.json` schema/digest，并要求 traversed commit 各自只有一个严格格式的 `Ledger-Digest` 声明；历史 recovery wrapper 的既有状态保持向后可读。相同 recovery identity 只有在已有 marker lineage 时才可幂等退出；未带 marker 的 owner head 必须继续写入 bot wrapper。
- Ledger CAS：登记写入使用 GitHub GraphQL `expectedHeadOid` 做原子比较交换；返回提交的单父、Verified 机器人签名和预期父 SHA 校验成功即证明该写入已持久化，随后其他 writer 推进 branch head 不得把已成功的写入误报为失败。
- 构建身份：`productVersion`、`buildVersion`、`sourceSha`；静态 `/version.json` 和只读 `GET /api/version` 暴露相同产品版本及来源。
- Product Release recovery：通过 `.github/workflows/retry-product-release.yml` 以 `release_id` 指向原 Product Release run，并在原 run 上执行 GitHub rerun；它不创建 successor release identity。
- Preparation gate recovery：准备 PR 已合并但确切 main CI/E2E 门禁在 Product Release 绑定前失败时，通过专用 workflow 以 `release_id` 和 incident reason 废弃未绑定身份；它不重跑或接管 Product Release。
- Failure phase：`resolve`、`restore`、`freeze_inputs`、`retain_inputs`、`record_inputs`、`preflight_media`、`build_products`、`verify_products`、`retain_products`、`record_products`、`publish_prerelease`、`publish_stable` 或 `unknown`；历史 ledger 的旧字符串 phase 必须继续可读。

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

两种产物均发布成功后系统才能标记产物发布完成。产品预发布的完成条件是两种产物的实际发布证明，部署和正式 latest 晋升 MUST 明确标记为不适用，MUST NOT 伪造已部署或已晋升证明；正式发布完整流程的完成条件还包括既定部署和 latest 验证。部分失败后的恢复 MUST 复用原请求、版本、来源、预留、冻结输入和产物校验值；同一身份出现不同内容时 MUST 拒绝覆盖。冻结 inputs 后的失败 MUST 默认重跑原 Product Release run，不得引导 abandon 或创建 successor identity。

### REQ-MVR-007

部署及恢复 MUST 消费同一份已验证产物。产品版本和构建标识 MUST 分别记录，使静态产物和镜像的发布来源可追溯。

### REQ-MVR-008

手动工作流 MUST 仅接受可选字符串 `version`，且仅从 main 发起。输入 MUST 支持留空、`stable`、`alpha`、`beta`、`rc` 和完整产品版本；MUST NOT 要求独立 `channel` 或 `target` 输入。最终产品版本 MUST 是完整 SemVer，快捷请求 MUST NOT 直接写入 VERSION、登记的版本、tag 或产物。正式语义基线 MUST 来自可信已发布正式产品版本及其来源，预发布 MUST NOT 取代此基线；待发布区间 MUST 覆盖基线之后的全部成员变更。自动或指定版本的主、次、补丁版本 MUST 至少达到最高 verified 影响要求的语义目标，完整版本 MUST 按 SemVer 顺序高于所有已占用版本。这两项约束 MUST 分别校验；与目标核心相同的预发布不能仅因低于该核心的正式版本而被拒绝。公开 API 与持久状态兼容性 MUST 分别保留 planned、current、verified 结论及与当前文件 blob 绑定的证据；证据缺失、过期或未覆盖时停止。

语义证据过期指可信基线、待发布变更范围、文件或验证见证 blob、公开 API 或持久状态兼容性假设发生变化，原 verified 结论不再覆盖当前来源。评估时间用于审计，不设置仅按经过天数失效的期限。

### REQ-MVR-009

预留更新 MUST 通过 GraphQL `createCommitOnBranch` 绑定登记分支旧 `expectedHeadOid`，产生唯一父提交并原子比较交换。准备 PR MUST 使用内置 `GITHUB_TOKEN` 创建 GitHub 签名、Verified、Signed-off-by 提交，并采用 squash 自动合并；主干来源移动后 MUST 阻断旧准备。关闭未合并 PR MUST 废弃预留，版本不得再次分配。

来源移动后的重新准备 MUST 由原发版人以新的手动运行发起。尚未登记 PR 的旧预留 MUST 核验不存在开放或已合并 PR，再废弃并保留记录和已占用版本；关闭但未登记的 PR MUST 核验原准备来源。原运行重跑 MUST NOT 废弃旧身份或替换来源，其他发版人 MUST NOT 接管准备。

### REQ-MVR-010

准备 MUST 显式 dispatch 确切 preparation head 的 CI/E2E；合并衔接 MUST 核验全部确切 SHA 的评估作业，并由同一内置 `GITHUB_TOKEN` 通过 Checks API 发布带有发布身份和 PR 关联的成功检查见证，使保护规则能够识别该评估结果。该见证 MUST 只在确切 CI/E2E 成功、登记身份、PR 编号、PR head 和来源仍一致时发布；不得调用审批接口或绕过 main 保护。随后合并衔接 MUST 观察受保护的自动合并并显式 dispatch 同一 merge SHA 的 main CI/E2E。发布 MUST 由 CI/E2E 的 main push 或已验证 dispatch 完成事件自动衔接，核验确切 merge SHA 的全部 main required checks。为覆盖内置令牌抑制主线 push 事件的情况，Product Release MUST 提供无输入的受控 `workflow_dispatch` 恢复入口；该入口 MUST 从 release-ledger 自动解析唯一仍有效的已合并登记身份，重新核验 PR merge SHA 和确切 main required checks，身份缺失、不唯一、不一致或检查未通过时 MUST 安全退出，并 MUST NOT 接受或猜测版本、来源或产物输入。普通实现提交 MUST 跳过产品发布。PR 可取消过期运行；main 和发布评估 MUST 保留必需运行。重跑 MUST 使用原运行身份及策略。

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

### REQ-MVR-017

Product Release 的 failure/cancelled recovery MUST 通过 `retry` workflow 只接受 `release_id`，严格核验原 run ID、repository、workflow path、main、merge SHA、未完成 stage 和 run conclusion，再调用原 run rerun；MUST NOT 接受 version/source/artifact 参数、创建 successor identity 或复制 artifact。新失败 MUST 记录固定 phase 与实际 step，成功推进或完成恢复 MUST 清除旧 failure。

### REQ-MVR-018

冻结 inputs 后、镜像构建前 MUST 执行 deterministic frozen-media preflight。预检 MUST 复用同一 frozen snapshot、media manifest 和 build config，不得访问变化中的远端媒体；MUST 验证静态构建的完整 media closure，并写入绑定 release identity、merge source SHA 和 inputs manifest digest 的静态输出证明。镜像构建 MUST 只消费匹配证明；identity、source 或 inputs digest 不匹配时 MUST 拒绝复用，预检失败 MUST 停在可重试阶段且不得绑定 products。

### REQ-MVR-019

Product Release run 本身只有两类 abandon：没有任何 frozen artifact 的 pre-artifact failure/cancelled，或原 frozen artifact 已由 GitHub 证明不可恢复且 emergency workflow 同时提供人工确认与 incident reason。只要 frozen inputs artifact 可用，input-only abandon MUST 拒绝；abandoned identity MUST NOT revive or reallocate。

### REQ-MVR-020

准备 PR 已合并但 Product Release 尚未绑定、且确切 merge SHA 的 main CI/E2E 门禁失败时，系统 MUST 提供一个只接受 `release_id` 和 incident reason 的专用废弃 workflow。该 workflow MUST 重新核验登记 PR、准备来源、Verified 的 VERSION-only 合并、确切 main 评估的终态失败以及当前 main；MUST 拒绝 pending、success、来源不可信、已有 Product Release run、frozen artifact、GitHub Release 或 publication proof 的身份。成功废弃 MUST 通过 GitHub Actions 签名 ledger 提交烧毁版本；后续新发布 MUST 创建新的 release identity 并按已占用版本下界分配，MUST NOT 复用旧来源、版本、提交或产物。

### REQ-MVR-012

仓库 MUST 启用自动合并、main PR-only、严格 up-to-date、Verified commits、禁止 force/delete 和管理员受约束规则，不新增人工审批人数。发布身份 MUST 使用内置 `GITHUB_TOKEN` 与 `github-actions[bot]`，不得要求新增 App、私钥或 PAT。仓库 MUST 允许 Actions 创建 PR；代码 MUST NOT 调用审批接口或绕过 main 保护。准备和衔接按 job 声明必需的 contents/pull-requests/actions/checks 权限，GHCR 采用 job 级 packages:write，默认 Actions 只读，Playbook 来源 token 独立。实际配置、机器人 Verified 提交及非生产 Candidate Actions 运行 MUST 提供验收证据。

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

- Method: 核验确切 preparation head 的 CI/E2E、PR 关联检查见证、完成事件、同 SHA main 检查和原运行恢复测试。
- covers: `REQ-MVR-010`, `REQ-MVR-011`
- Pass condition: 普通提交跳过、错误来源或 skipped 必需检查不能发布；未通过确切评估不得发布 PR 检查见证；静态和 OCI 产物来源一致，恢复仅补齐缺失步骤，丢失/摘要冲突阻断；预发布的部署和正式 latest 操作为不适用，较旧身份不回退生产指针。

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

### VER-MVR-013

- Method: 运行 release ledger、原运行重试、失败分类、通知 metadata、准备门禁失败恢复与 abandon boundary 的 focused contract tests，并核对 recovery workflows 只声明各自允许的身份输入。
- covers: `REQ-MVR-006`, `REQ-MVR-017`, `REQ-MVR-019`, `REQ-MVR-020`
- Pass condition: frozen inputs 后的恢复保留原 release identity、版本、merge SHA、run ID 和已绑定摘要；成功推进清除旧 failure；可用 inputs artifact 拒绝 input-only abandon；没有 Product Release 绑定且 exact main gate 失败的准备身份只能在 PR、merge、终态失败和无产物证据全部通过后废弃；其他状态均拒绝。

### VER-MVR-014

- Method: 运行 frozen-media preflight、产品复用和 workflow 顺序 contract tests，并检查静态输出证明的 identity、source SHA 与 inputs manifest digest 绑定。
- covers: `REQ-MVR-018`
- Pass condition: media closure 缺口在 image packaging 前失败；同一 frozen snapshot、manifest 和 build config 的静态输出可被 image build 复用；identity、source 或 inputs digest 不匹配时拒绝复用，预检失败不绑定 products。

### VER-MVR-015

- Method: 在不改变 production/latest 或生产内容指针的 pre-completion release identity 上执行一次 GitHub Actions 原运行 rerun drill，并保存原 run URL、run attempt、ledger 与 artifact 证据。
- covers: `REQ-MVR-017`, `REQ-MVR-018`
- Pass condition: rerun 继续原 Product Release run，run ID、版本、merge SHA、冻结 inputs 和已验证 products 不变，`run_attempt` 递增，预检与后续边界实际执行；不得生成新版本、successor identity 或生产指针变化。

## Related ADRs

- [ADR 0014](../../adr/0014-unified-product-release-version-scope.md)
- [ADR 0015](../../adr/0015-manual-version-release-delivery.md)
- [ADR 0016](../../adr/0016-signed-release-ledger-and-frozen-products.md)
- [ADR 0017](../../adr/0017-product-prerelease-publication-boundary.md)
- [ADR 0018](../../adr/0018-product-prerelease-version-allocation.md)
- [ADR 0025](../../adr/0025-release-pr-check-attestation.md)
- [ADR 0029](../../adr/0029-release-recovery-and-frozen-media-preflight.md)
- [ADR 0033](../../adr/0033-release-preparation-gate-recovery.md)

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Style Playbook: Manual version release delivery](https://github.com/IvanLi-CN/style-playbook-skills/blob/745edab21fbe8b8a2f9f13c13c34498a9d3945cb/skills/style-playbook/references/topics/manual-version-release-delivery/TOPIC.md)
- [Style Playbook: Release failure notification](https://github.com/IvanLi-CN/style-playbook-skills/blob/745edab21fbe8b8a2f9f13c13c34498a9d3945cb/skills/style-playbook/references/topics/release-failure-notification/TOPIC.md)
- [Style Playbook: Quality gates](https://github.com/IvanLi-CN/style-playbook-skills/blob/745edab21fbe8b8a2f9f13c13c34498a9d3945cb/skills/style-playbook/references/topics/quality-gates/TOPIC.md)
- [实现状态](./IMPLEMENTATION.md)
- [主题记录](./HISTORY.md)
