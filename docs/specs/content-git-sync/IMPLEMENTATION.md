# 内容库与内容仓库双向同步 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 推送、拉取、三方合并、远端新增/删除、差异对比界面均已实现并有定向测试；文章与 Memo 在仓库同步中同等对待。一次性导入、权威开关与仓库初始化脚本已实现，权威切换尚未在线上执行。
- Lifecycle: active
- Catalog note: 取代 [本地内容源真实目录布局](../local-real-content-layout/SPEC.md) 的内容来源部分。

## Implementation Coverage

- `REQ-CGS-002`：`src/lib/content-repo/github.ts` 只经 GitHub API 交互，解析 ref 到 commit 与树、递归列出 blob、创建 blob/tree/commit 并以非强制方式更新分支 ref。不 clone、不落盘、不调用 `git`。
- `REQ-CGS-003`：`src/lib/content-repo/canonical.ts` 固定 frontmatter 字段与顺序、省略空值、统一换行与行尾空白，并把媒体引用改写为相对仓库路径。
- `REQ-CGS-004`：`drizzle/0033_content_repo_baselines.sql` 与 `contentRepoBaselines` 保存内容 hash、媒体 sha、远端 blob sha 与提交；仅在 ref 更新成功后写入。
- `REQ-CGS-006`：单篇、批量与全部推送均经 Git Data API 形成单个提交；无差异内容跳过且不产生提交；远端已存在同路径且无基线时返回 `claim-required` 而不覆盖；单批上限 200；提交信息固定。
- `REQ-CGS-010`：附件按 sha 比对，只有变化的上传；超过文章 50 MiB 或 Memo 20 MiB 的内容被标为 `oversized` 并阻止该内容推送。
- `REQ-CGS-012`：同一时刻只允许一个推送；任务记录复用 `content-tasks` 的执行归属。
- `REQ-CGS-014`：`CONTENT_REPO_REPOSITORY`、`CONTENT_REPO_REF`、`CONTENT_REPO_TOKEN` 仅服务端读取；缺少令牌返回 `unconfigured`，不阻塞其它功能；路径经规范化拒绝越界。
- `REQ-CGS-016`：认证与权限失败不重试；前置条件冲突在 ref 更新处有界重试一次；重复推送无新提交；差异不是失败。

- `REQ-CGS-001`、`REQ-CGS-015`（媒体身份）：`drizzle/0034_content_media.sql` 与 `contentMedia` 记录每个附件的路径、sha、字节数与 MIME；上传写入身份，推送时对未记录附件做一次采纳、对 sha 不符的附件受控失败并指出路径。
- `REQ-CGS-008`：`src/lib/content-repo/merge.ts` 用 `node-diff3` 以基线正文为祖先做行级三方合并，frontmatter 按字段合并并报出冲突键；`mergeContentRepo` 在无冲突时写库并推进基线，有冲突时原样返回字段与正文冲突数且不写库；文章与 Memo 走同一条路径，Memo 的 clipping 字段在规范化时保留。
- 差异与合并不设独立导航项；`/admin/content-sync` 在内容仓库存在待处理文件时显示"内容仓库待同步"卡片（计数与入口），入口跳转 `/admin/content-merge`。
- `REQ-CGS-015`（界面部分）：`/admin/content-merge` 以状态表列出内容与附件情况，差异与合并页使用应用壳的 route 侧栏承载内容仓库文件树：带目录节点与展开/收起、按树序压平的虚拟滚动列表（目录行显示文件数），文件行右侧是图标徽标（左侧图标、右侧数量，如适用）：冲突数量、待推送、待拉取、远端新增/删除或无冲突勾选；目录行按固定顺序聚合其下文件的状态徽标（冲突、待拉取、待推送、远端新增、远端删除、无冲突）；上方提供"重新同步"。右侧以待处理文件为卡片，一张卡一个文件；保存成功后才把该文件标为已解决。文件集合在进入页面时快照，只有重新打开页面或点击"重新同步"才更新；保存或裁决不会让文件从树和卡片中消失，期间只更新冲突/已解决状态。"重新同步"会按新的远端/本地摘要清理已保存标记：摘要变化即重置该文件进度，否则保留。卡片以"路径+远端摘要+本地摘要"为 key，同步更新了该文件即重置未保存的裁决。
详情区不再显示冲突摘要告警；布局切换（行内/双栏/三路）位于操作行最右端，整篇采用按钮紧随导航计数，保存按钮位于详情卡片头部右端，作为唯一写入动作：先保存到内容库，仓库已配置时立即自动推送该文件，未配置则只落库并提示；推送失败保留落库结果并提示可重试；卡片不再提供单独的"推送到仓库"按钮。保存前读取当前模式的未决冲突数，存在未解决冲突时必须先弹出确认对话框（列出数量、取消/继续保存），不允许静默保存，并把整篇文档交给两种对比方式：三种模式的 CodeMirror 表面统一使用 Markdown/YAML 语法高亮（`merge-editor-language`）、编辑器内查找与当前行高亮，并统一使用 `mergeEditorTheme`，颜色全部取自管理端主题变量，浅色/深色主题下差异色、折叠条与选中色都会跟随；行内使用 CodeMirror 统一合并视图，每处差异上方是一整行可读的裁决按钮（采用远端），只有该处差异真正消失时按钮与计数才一起减少，不存在隐藏按钮但仍保留差异的状态；三路模式由 `node-diff3` 区域驱动一个三栏一体框架（单一边框与表头；左本地只读、中合并结果可编辑、右远端只读），每处冲突在合并结果窗格内以面板渲染（本地/基线/远端三个按钮，来自共用 Button/Badge 原语）；裁决写入 editor state 并用 `invertedEffects` 参与历史，裁决后未决面板消失，撤销同时还原文本与裁决；共享模式，顶部显示已解决 x/y 与未解决数量，未解决时保存仍可用并提示；双栏使用 MergeView，两侧都可直接编辑，每个改动块在本地侧沟槽有"← 采用远端"、在远端侧沟槽有"→ 写回远端"，保存时以本地窗格内容为准；x/y 始终等于两侧当前真实差异块数量，任何使两侧一致的操作都会让计数立即下降，不允许在仍有差异时显示 0。两种模式的工具栏只保留图标导航（中间显示 x/y 未决进度）、整篇选边与保存，未决冲突存在时保存禁用；附件预览使用 4:3 容器、宽度平分父容器，图片按容器等比放大但不超过原始尺寸的 200%；预览通过带会话的 fetch 读取二进制并生成对象 URL 后渲染，避免直接 img 请求绕过鉴权与演示 mock；加载失败显示文件名占位。附件在列表中是独立文件行，只做自己的两侧比较与采用，不与文档共用裁决面；未更改内容折叠，基线放在可折叠的祖先栏中，并显示合并预览，冲突字段与正文冲突处数单独提示，并按状态提供合并、推送、拉取、接受远端新增与确认远端删除。逐处可用 CodeMirror 的接受/回退处理并由"保存到内容库"写回；frontmatter 可对每个字段选择基线、本地或远端并把结果写进同一份文本；附件区并列显示远端与本地版本，图片、视频、音频可直接查看，其余提供下载，并可"采用远端"替换本地文件并刷新媒体身份。
- `REQ-CGS-009`：`acceptRemoteNew` 仅接受 `remote-new` 的路径并建立内容与基线；`removeRemoteDeleted` 仅删除 `remote-deleted` 的内容与基线，两种动作都按路径白名单执行。
- `REQ-CGS-005`：`src/lib/content-repo/state.ts` 按同步基线与远端 blob sha 得出已同步、待推送、待拉取、远端新增、远端删除与合并冲突，并单独列出缺失附件。
- `REQ-CGS-007`：`checkContentRepo` 只解析 ref 与读取树清单，列出差异状态，不写库。`pullContentRepo` 处理 `to-pull` 的文章与 Memo：读取目标 blob、解析 frontmatter、写库并推进基线，随后清理搜索缓存；附件有变化的条目跳过并给出原因。
- `REQ-CGS-007`、`REQ-CGS-008`、`REQ-CGS-009`、`REQ-CGS-015`（拉取/合并/远端新增删除/界面）覆盖 Memo 与文章：仓库路径 `Memos/<file>.md` 与 `blog/<slug>.md` 使用同一条拉取、合并与采纳路径，同步基线按内容类型记录 `kind`；仓库中存在而内容库没有的路径（含 Memo）由 `computeSyncStates` 列为 `remote-new`。
- `REQ-CGS-013`：`scripts/content-cutover.ts`（`src/server/services/content-cutover.ts`）在服务停止时按扫描范围枚举文件，把文章规范化为 `blog/<slug>.md`、Memo 保留 `Memos/<file>.md`，将引用附件复制到 `<kind>/assets/` 并登记身份，写入 `content_authority` 标记；重复执行返回 `completed`。`CONTENT_AUTHORITY=database` 关闭本地源注册、增量/全量同步与判废，并保留 `LOCAL_CONTENT_BASE_PATH` 作为媒体根。`scripts/content-repo-seed.ts` 按单批上限分批推送，生成仓库初始提交。
- `REQ-CGS-001`：MCP 与剪藏在数据库权威下直接写库并记录媒体身份，不再写 Markdown 内容文件或触发扫描。
- 未实现：`REQ-CGS-011`（合并保存的乐观并发校验）、`REQ-CGS-015`（内容文件读写接口的最终退役清单）、真实仓库与生产切换的现场验收。
- Verification commands: `bun test src/lib/content-repo src/server/services/content-repo-sync.test.ts src/server/services/content-repo-memo-sync.test.ts src/server/services/content-cutover.test.ts src/lib/content-sources/authority-gate.test.ts`（60 pass）；`bun test --isolate src/server/mcp src/server/clipping`（138 pass）；`bun run db:migrations:validate`；`DB_PATH=<tmp> bun run migrate`。
- Rollout facts: 推送入口当前只有管理员 tRPC `contentRepo.status` 与 `contentRepo.push`，没有界面入口，也没有定时任务；权威切换与本地源退役不在本次范围内。

## Coverage / rollout summary

- 本次只新增服务端推送能力，不改变内容读取路径、不停止本地扫描、不改动既有同步任务；迁移期间本地源扫描范围保持不变。

## Remaining Gaps

- 媒体身份在附件上传、推送采纳与导入搬迁时记录；MCP 正文内嵌的外链媒体仍不登记，读取时也不核对（`REQ-CGS-001`、`REQ-CGS-015`）。
- 切换前内容仍有本地扫描与库编辑两个写入者；切换后写入者只有数据库（管理端、MCP、剪藏），扫描任务与判废路径不再运行（`REQ-CGS-001`、`REQ-CGS-013`）。
- 与真实仓库的 smoke 验证尚未执行；当前只有注入式 transport 与纯函数测试。
- 权威切换已具备代码与 runbook，等待维护窗口执行；执行前需要一个私有空仓库与可读写该单一仓库的 token。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
