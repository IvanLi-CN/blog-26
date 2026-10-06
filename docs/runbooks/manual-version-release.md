# 手动产品发版

产品固定为静态前台和完整功能 Docker 镜像。版本策略和发布身份来自 [.github/release-contract.json](../../.github/release-contract.json)，合并检查来自 [.github/quality-gates.json](../../.github/quality-gates.json)。

## GitHub Actions 发布身份

发布自动化使用仓库内置 `GITHUB_TOKEN` 和 `github-actions[bot]`。通过 GraphQL `createCommitOnBranch` 绑定 `expectedHeadOid` 创建 GitHub 签名提交，核验唯一父提交、Verified、Signed-off-by 和 provenance。登记分支从批准的 bootstrap SHA 建立；签名初始化提交绑定该 SHA，此后的状态更新执行原子的 expected-head 比较交换。

仓库 Actions 默认权限保持只读。为创建 VERSION-only PR，开启 “Allow GitHub Actions to create and approve pull requests”；发布代码只创建 PR 和启用受保护的自动合并，不调用审批接口，不获得 main 绕过权限。准备 job 按需声明 contents/pull-requests/actions 写权限，发布 job 声明 contents/packages 写权限，合并衔接 job 仅声明 actions 写权限；Playbook 来源 token 独立。

配置读回使用 `bun scripts/release-settings.ts`；已获仓库配置授权时使用 `--apply` 对齐声明。从实现候选分支运行 CI/CD Pipeline 的 `workflow_dispatch`，其中 **Release Token Probe** 使用只读令牌核验已初始化的签名登记并展示 commit URL。签名登记的初始化和更新属于 main 的正式准备流程；候选探针不创建登记、产品版本 tag，不上传 GHCR 或部署生产。

内置令牌产生的事件不能作为自动触发下一条工作流的可靠前提。准备阶段显式 dispatch 同一 preparation head 的 CI/E2E，Release Merge Followup 核验全部检查并观察受保护的 squash 自动合并，再显式 dispatch 同一 main merge SHA 的 CI/E2E。Product Release 只消费登记过且检查通过的 merge identity；后续衔接不需要第二次人工触发。来源移动、检查失败或无法观察合并时停止，并保持原身份供对应运行重试。

## 输入与流程

从 main 手动运行 **Manual Product Release**。唯一输入 `version` 为可选项；留空按整个待发布区间的最高已验证语义影响自动递增，填写时仅接受规范 `X.Y.Z` 且必须向前并满足兼容性政策。

版本准备先写持久预留，再创建仅修改 VERSION 的 PR 并启用自动合并。GitHub 等全部 required checks 通过后合并。**Product Release** 核验同一合并提交的 main CI/E2E、机器人来源及预留，构建并冻结两种产物，发布 GitHub Release 和 GHCR 镜像，随后将相同静态产物部署到 EdgeOne。部署验证完成后推进 latest。

## 语义证据

`docs/version-impact/` 保存成员变更的 planned、current、verified 结论以及 API/state 的分开证据。记录绑定被评估文件的 Git blob；缺失、过期或未覆盖的变更会阻断发布。版本文件、PR 数量和提交描述都不是版本基线或分类证据。

记录的 `base_sha` 为可信已发布来源，`covered_files` 覆盖该来源之后所有待发布文件变化，删除文件用 null。证据条目记录仓库相对路径、Git blob 和实际验证命令。新增改动必须更新 current 并重新验证受影响结论；不得把未运行命令或缺失现场权限证据写成 verified。记录 JSON 本身不纳入其文件覆盖清单，避免自引用摘要。

## 恢复

重跑失败的原工作流；不重新 dispatch 一个替代版本。恢复读取原 release-ledger 登记，复用版本、来源、输入和冻结产物，仅补齐缺失步骤。已存在 tag、发布资产或镜像的身份与摘要不同则停止，不能覆盖。

冻结产物保留 90 天。产物失效或缺失时报告恢复受阻，不联网重新生成同身份的新内容。关闭未合并的版本 PR 会废弃预留，已占用版本不会重新分配。较新版本已完成生产部署后，旧身份重跑不会回退生产指针。

若上传完成但登记绑定尚未完成，恢复会核验原 Actions 运行所有尝试的冻结、构建及上传步骤记录。已经完成冻结或上传却找不到对应产物时停止；原运行记录不可验证时也停止。只有原记录证明该类产物尚未冻结，才允许继续初次生成。

主干在 PR 创建前移动时，原运行重跑仍会阻断。原发版人重新手动触发准备后，系统核验旧准备尚无 PR，或其 PR 已关闭且未合并，再将旧登记标记为废弃并保留已占用版本，为新来源重新分配身份；若仍有开放 PR，先关闭该 PR。新触发不得接管其他发版人的准备。

## 操作边界

仓库自动合并开关允许为单个 PR 启用自动合并，不会自动合并所有 PR，也不会绕过保护规则。实现 PR 合并不会发版；只有登记过的 VERSION-only PR 能进入产品发布链路。

内容更新与产品发布共享 `blog26-edgeone-production` 锁，内容更新保留已部署 renderer 的产品版本。Docker 镜像发布到 registry 后，不自动更新服务器上的运行实例。
