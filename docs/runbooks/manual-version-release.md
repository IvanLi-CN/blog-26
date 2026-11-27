# 手动产品发版

产品固定为静态前台和完整功能 Docker 镜像。版本策略和发布身份来自 [.github/release-contract.json](../../.github/release-contract.json)，合并检查来自 [.github/quality-gates.json](../../.github/quality-gates.json)。

## GitHub Actions 发布身份

发布自动化使用仓库内置 `GITHUB_TOKEN` 和 `github-actions[bot]`。通过 GraphQL `createCommitOnBranch` 绑定 `expectedHeadOid` 创建 GitHub 签名提交，核验唯一父提交、Verified、Signed-off-by 和 provenance。登记分支从批准的 bootstrap SHA 建立；签名初始化提交绑定该 SHA，此后的状态更新执行原子的 expected-head 比较交换。

仓库 Actions 默认权限保持只读。为创建 VERSION-only PR，开启 “Allow GitHub Actions to create and approve pull requests”；发布代码只创建 PR 和启用受保护的自动合并，不调用审批接口，不获得 main 绕过权限。准备 job 按需声明 contents/pull-requests/actions 写权限，发布 job 声明 contents/packages 写权限，合并衔接 job 仅声明 actions/checks 写权限和 pull-requests 读权限；Playbook 来源 token 独立。

配置读回使用 `bun scripts/release-settings.ts`；已获仓库配置授权时使用 `--apply` 对齐声明。从实现候选分支运行 CI/CD Pipeline 的 `workflow_dispatch`，其中 **Release Token Probe** 使用只读令牌核验已初始化的签名登记并展示 commit URL。签名登记的初始化和更新属于 main 的正式准备流程；候选探针不创建登记、产品版本 tag，不上传 GHCR 或部署生产。

内置令牌产生的事件不能作为自动触发下一条工作流的可靠前提。准备阶段显式 dispatch 同一 preparation head 的 CI/E2E；Release Merge Followup 先核验这些确切 SHA 的所有作业，再使用同一 `GITHUB_TOKEN` 通过 Checks API 发布带发布身份、外部 ID 和 PR 链接的成功检查见证，使 required checks 能识别已完成的评估。见证发布前必须再次核验登记身份、PR 编号、PR head、来源和 PR 仍可合并，不能调用审批接口或绕过保护规则。随后衔接观察受保护的 squash 自动合并，再显式 dispatch 同一 main merge SHA 的 CI/E2E。Product Release 默认消费登记过且检查通过的 merge identity；如果 Actions 机器人合并抑制了主线 push 的 `workflow_run` 衔接，可直接从 main 无输入 dispatch Product Release，入口会从 release-ledger 自动解析唯一仍有效的已合并身份，并重新核验确切 main CI/E2E，不能提供版本、来源或产物参数。没有身份、身份不唯一、来源不一致或检查未通过时必须安全退出。来源移动、检查失败或无法观察合并时停止，并保持原身份供对应运行重试。

## 输入与流程

从 main 手动运行 **Manual Product Release**（`.github/workflows/manual-product-release.yml`）。它是唯一的手动 release 入口，唯一可选文本输入 `version` 接受留空、`stable`、`alpha`、`beta`、`rc` 或完整 SemVer。留空等同 `stable`，不接受 `auto`。快捷值按整个待发布区间推导出的影响自动分配；完整版本精确指定，必须满足必要核心版本并高于全部已发布、预留与废弃版本。原始大小写与 metadata 保留，但 metadata 不改变排序，不能仅换 metadata 创建新身份。

版本准备先写持久预留，再创建仅修改 VERSION 的 PR 并启用自动合并。GitHub 等全部 required checks 通过后合并。**Product Release**（`.github/workflows/product-release.yml`）不接受第二个人工版本输入，而是消费已登记且通过确切 main CI/E2E 检查的 release identity，构建并冻结两种产物，发布 GitHub Release 和 GHCR 镜像。正式版随后将同一静态产物部署到 EdgeOne，验证后推进 latest；所有带预发布标识的版本仅发布产物，Release 标记 prerelease，不部署站点、不推进正式 latest，也不接收 EdgeOne 部署密钥。

如果准备 PR 已合并但确切 merge SHA 的 main CI/E2E 门禁失败，且 Product Release 尚未绑定该身份，不能把它当作可发布版本，也不能运行 Product Release retry。先运行 **Abandon Failed Release Evaluation**（`.github/workflows/abandon-failed-release-evaluation.yml`），只填写登记的 `release_id` 和 incident reason；入口会重新核验准备 PR、Verified 的 VERSION-only 合并、确切 main 失败，以及没有 Product Release run、artifact、GitHub Release 或 publication proof。成功后版本永久烧毁，重新运行 **Manual Product Release** 并将 `version` 留空即可取得新的稳定版本。

旧的 PR-label/label-gate/release workflow 只作为迁移历史保留，不是当前操作入口；当前发布真相是手动 `version` 请求、登记身份和 Product Release 的消费边界。

例如正式基线为 `2.7.0`、推导 impact 为 minor，连续新请求可分配 `2.8.0-alpha.1` → `2.8.0-alpha.2` → `2.8.0-beta.1` → `2.8.0-rc.1` → `2.8.0`，允许跳过阶段。同核心进入 beta 后再请求 alpha 会停止；可显式填写更高的完整目标，例如 `2.9.0-alpha.1`。每个完整版本有独立身份、发布 PR、确切合并来源及冻结字节，不能将预发布产物直接改标正式版。Git tag 为 `v` 加完整版本；镜像 tag 同样带 `v`，仅将 metadata 分隔符 `+` 映射为 `_`，长度超出 registry 限制时预留前拒绝。

## EdgeOne 静态产物与 STEP 预览验收

公开项目页的 STEP 预览由仓库构建静态产物，再交给 EdgeOne Makers 发布。PR 阶段只构建和检查候选产物，不执行生产 EdgeOne 发布，也不依赖控制台自定义 MIME/header 配置。

构建候选静态产物：

```bash
bash scripts/build-edgeone-content-artifact.sh
```

构建后确认 `edgeone-dist/projects/flux-purr/online-3d-viewer.js` 和 `edgeone-dist/projects/flux-purr/model-viewer.js` 存在，并确认 `edgeone-dist/projects/flux-purr/online-3d-viewer.mjs` 不存在。`online-3d-viewer.js` 仍是 ES Module；页面和动态加载脚本必须继续使用 `type="module"`，源码中的 `import`/`export` 和模块依赖图不能删除或改成 classic script。

合并并完成正式发布链路后，先确认部署身份对应合并 SHA，再检查 EdgeOne 返回的 MIME：

```bash
curl -fsSL -D - -o /dev/null \
  https://ivanli.cc/projects/flux-purr/online-3d-viewer.js
```

响应必须返回 `application/javascript` 或 `text/javascript`。随后打开 IsolaPurr 项目详情页，依次切换四按键打印件、底部外壳和内部支架三个标签，确认 viewer 注册成功、预览进入 ready 状态，并确认浏览器控制台没有 module MIME 错误。模型请求应分别指向三个 IsolaPurr 同源 STEP 路径；Flux Purr 和 Mains Aegis 的模型条目同样必须使用各自项目目录下的显式 `modelUrl`。

如果浏览器仍加载旧的 `model-viewer.js`，确认请求 URL 使用 `v=theme-7`，再清理候选缓存或重新打开页面。不要通过 EdgeOne 控制台把 `.mjs` 强制声明为 JavaScript，也不要把 STEP 文件设置为 JavaScript MIME；正确修复是使用 `.js` 扩展名获得静态服务器的 JavaScript MIME，同时保留 ES Module 语义。

## 语义证据

GitHub 适配器固定 REST API `2022-11-28`，按该字段合同核验 PR 与真实合并来源。升级 API 版本前必须先核验 PR 元数据与恢复所需字段；`2026-03-10` 已删除所有 PR 响应中的 `merge_commit_sha`，不得通过放松来源校验来兼容。[GitHub breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes)。

发布影响由 `src/lib/release/impact.ts` 从已发布基线与候选来源的差异直接推导，不需要任何人工维护的分类文件。推导以已登记的发布基线、候选提交树和区间内的提交正文为输入：以同一基线重算，永远得到同一 `impact` 与 `evidenceDigest`，因此已预留的发布可以随时重新核验。

`contractSurfaces` 声明公开契约面（`drizzle/<name>.sql`、`src/lib/schema.ts`、`src/server/public-api/**`、`src/server/routers/**`、`src/server/version-api.ts`、`src/lib/<name>-contract.ts|contracts.ts`、`site/pages/api/**`）；逐条正则以 `src/lib/release/impact.ts` 为准。文档、测试、样式和内部模块不在其中，它们无法改变已发布契约，因此推导为 `patch`；契约面目录内的 `*.test.ts` 同样被排除。

推导下界是 `patch`。破坏性迁移（`DROP TABLE|COLUMN`、`RENAME`、`ALTER COLUMN`、无默认值的 `NOT NULL` 新增列、删除已应用迁移）会把下界提升到 `minor`，因为旧版本不再能读取持久化状态。`major` 从不自动推导：它是业务决定，必须由提交正文的 `Release-Impact: major` 显式请求。

提交正文中的一行 `Release-Impact: patch|minor|major` 是唯一的人工上调通道，且只能上调、不能下调。分类结果写入 `ledger` 的 `impact` 字段并决定版本号下界，因此版本基线可回溯到确切提交，而不依赖 PR 数量或人工维护的记录文件。该 trailer 只对预留时 `baselineSha..sourceSha` 区间内的提交生效；预留之后追加的 trailer 不改变已登记的 `impact`。

预发布不替换正式语义基线。期间登记过的 VERSION-only 差异必须通过签名、发布 PR 和确切父提交验证，随后从业务语义覆盖中单独核验；它不改变业务语义差异的推导范围。未知 VERSION 修改仍阻断发布。

## 恢复

Product Release 失败或取消后，默认运行 **Retry Product Release**（`.github/workflows/retry-product-release.yml`），只填写原 `release_id`。入口会核验 ledger identity、原 Product Release run ID、main、workflow path、merge SHA、当前未完成 stage 和失败/取消结论，然后调用 GitHub `rerun` API；这是同一个 run 的新 `run_attempt`，不是新的 Product Release run、版本、reservation 或 artifact。直接在 GitHub Actions 页面重跑原 Product Release run 具有相同合同，但不得新建一个 manual Product Release run 接管已冻结 identity。

原 run 恢复时先 restore 原 run 的 inputs/products；已登记的 artifact、版本、sourceSha、mergeSha 和摘要只能复用，任何 identity 或字节冲突都停止。成功的 `record inputs`、`record products` 或 publication checkpoint 会清除旧 failure；通知会显示 version、identity、source/merge SHA、run URL、attempt、phase、step 和 recovery target。

如果 Product Release 在任何 inputs/products 产生前被 GitHub Actions 取消，仍应先 retry 原 run。只有确认原 run 无 artifact 且决定放弃时，才手动运行 **Abandon Cancelled Product Release**（`.github/workflows/abandon-cancelled-release.yml`）；入口会再次核验原运行、拒绝已有冻结产物，并将该身份正式标记为 abandoned。随后重新运行 **Manual Product Release**，版本留空即可按已验证影响自动分配下一个可用版本，不复用已烧毁身份。

如果 Product Release 已冻结 inputs 但在生成 products 前失败，必须运行 **Retry Product Release**，不能 abandon；原 inputs artifact 可用时，**Abandon Failed Product Release Inputs**（`.github/workflows/abandon-failed-inputs-release.yml`）会拒绝。只有 GitHub 已证明原 inputs artifact 缺失或过期、没有任何 products artifact，并且确实决定烧毁 identity 时，才允许该 emergency workflow；它要求 `confirm_loss=true` 和非空 `incident_reason`，会保留原失败上下文并标记 abandoned。该操作必须在 GitHub Actions 中执行，以保留 release ledger 所需的 `github-actions[bot]` Verified 签名；本地用户令牌不能直接写入 ledger。

Product Release 在 `record inputs` 后、镜像构建前执行 **Preflight frozen media closure**：它只读取同一 frozen snapshot、media manifest 和 build config，使用相同静态构建验证 watermark/clipping 等媒体闭包，并写入绑定 identity/sourceSha/inputs manifest digest 的静态输出证明。预检失败会停在可重试的 `preflight_media` 阶段，不会创建 products artifact；预检通过后镜像阶段消费该静态输出，不重新访问变化中的远端媒体。

历史 frozen catalog 需要兼容投影时，输入冻结仍使用登记源工具；预检和镜像阶段可以使用当前已验证的 Playbook 兼容工具。该覆盖只修复读取/校验边界，不改变 release identity、登记源 SHA 或 frozen 输入字节。

同一准备 run 重跑复用原始请求与身份；前一身份完成后，新 run 可申请下一个版本。预发布两种产物发布成功后，记录共享锁内正式 GitHub latest、镜像 latest、生产版本与 Playbook 指针的前后读回；一致才能 complete，部署和晋升均记为 `not-applicable`。读取失败或变化不能当作不变证明。已完成预发布的幂等恢复不要求生产仍停留在历史指针。

首次验收时，批准的 bootstrap renderer 可能尚无静态 `/version.json`。仅当明确读回 404 且 Playbook rendererCommit 与 bootstrap 来源一致时记录该端点不存在；未知 renderer、其他错误或解析失败会停止。该记录不能当作新正式版部署的验收证据。

failure phase 固定为 `resolve`、`restore`、`freeze_inputs`、`retain_inputs`、`record_inputs`、`preflight_media`、`build_products`、`verify_products`、`retain_products`、`record_products`、`publish_prerelease`、`publish_stable` 或 `unknown`；ledger 仍兼容历史的 `merged` 等旧 phase，但新 failure 必须同时记录实际 workflow step。冻结产物保留 90 天。公开媒体冻结使用最多 8 个并发下载 worker，单请求仍受现有超时、重试和大小限制约束；Product Release 作业超时为 360 分钟，以覆盖大量静态媒体和外部网络抖动。产物失效或缺失时报告恢复受阻，不联网重新生成同身份的新内容。关闭未合并的版本 PR 会废弃预留，已占用版本不会重新分配。较新版本已完成生产部署后，旧身份重跑不会回退生产指针。

若上传完成但登记绑定尚未完成，恢复会核验原 Actions 运行所有尝试的冻结、构建及上传步骤记录。已经完成冻结或上传却找不到对应产物时停止；原运行记录不可验证时也停止。只有原记录证明该类产物尚未冻结，才允许继续初次生成。

主干在 PR 创建前移动时，原运行重跑仍会阻断。原发版人重新手动触发准备后，系统核验旧准备尚无 PR，或其 PR 已关闭且未合并，再将旧登记标记为废弃并保留已占用版本，为新来源重新分配身份；若仍有开放 PR，先关闭该 PR。新触发不得接管其他发版人的准备。

## 操作边界

仓库自动合并开关允许为单个 PR 启用自动合并，不会自动合并所有 PR，也不会绕过保护规则。实现 PR 合并不会发版；只有登记过的 VERSION-only PR 能进入产品发布链路。

内容更新与产品发布共享 `blog26-edgeone-production` 锁，内容更新保留已部署 renderer 的产品版本。Docker 镜像发布到 registry 后，不自动更新服务器上的运行实例。

## 修改发布代码前

`policyFingerprint` 覆盖 `src/lib/release/**`、`scripts/product-release.ts`、发布相关工作流，以及 `.github/release-contract.json` 与 `.github/quality-gates.json`。改动其中任一文件都会改变指纹，因此一个已登记但尚未完成的发布无法在新的树上传过 `assertPolicyIdentity`。

合并任何触及这些路径的 PR 之前，先确认没有在途发布：

```bash
git fetch origin release-ledger --quiet
git show origin/release-ledger:ledger.json | jq -r '
  [.entries[] | select(.stage != "complete" and .stage != "abandoned")]
  | if length == 0 then "no in-flight release" else .[] | "\(.version) \(.stage) PR #\(.prNumber)" end'
```

输出 `no in-flight release` 才可以合并发布代码改动。否则先让该发布走到 `complete`，或由原发版人显式废弃，再合并；直接合并会让那次发布以 `Release source policy changed` 失败并只能废弃重来。

已完成的发布不受影响：它不再被重新校验。指纹是该 `sourceSha` 树的函数——包含该树自己的 `contract`、`quality` 与策略 blob——因此从同一棵树重算必定得到记录值，与之后的 main 指纹不同不构成问题。
