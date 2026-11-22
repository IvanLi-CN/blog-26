# 内容库与内容仓库双向同步 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 推送基座已实现并有定向测试；拉取、合并、差异对比界面与权威切换尚未实现。
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
- `REQ-CGS-008`：`src/lib/content-repo/merge.ts` 用 `node-diff3` 以基线正文为祖先做行级三方合并，frontmatter 按字段合并并报出冲突键；`mergeContentRepo` 在无冲突时写库并推进基线，有冲突时原样返回字段与正文冲突数且不写库。闪念在权威切换前不合并。
- `REQ-CGS-015`（界面部分）：`/admin/content-merge` 以状态表列出内容与附件情况，详情区用一条合成摘要列出 frontmatter 与正文冲突，并把整篇文档交给两种对比方式：两种模式的 CodeMirror 表面统一使用 `mergeEditorTheme`，颜色全部取自管理端主题变量，浅色/深色主题下差异色、折叠条与选中色都会跟随；行内使用 CodeMirror 统一合并视图，每处差异上方是一整行可读的裁决按钮（采用远端/保留本地），选择后该行按钮消失、计数随之下降；双栏使用 MergeView，两侧都可直接编辑，每个改动块在本地侧沟槽有"← 采用远端"、在远端侧沟槽有"→ 写回远端"，保存时以本地窗格内容为准；x/y 始终等于两侧当前真实差异块数量，任何使两侧一致的操作都会让计数立即下降，不允许在仍有差异时显示 0。两种模式的工具栏只保留图标导航（中间显示 x/y 未决进度）、整篇选边与保存，未决冲突存在时保存禁用；附件在列表中是独立文件行，只做自己的两侧比较与采用，不与文档共用裁决面；未更改内容折叠，基线放在可折叠的祖先栏中，并显示合并预览，冲突字段与正文冲突处数单独提示，并按状态提供合并、推送、拉取、接受远端新增与确认远端删除。逐处可用 CodeMirror 的接受/回退处理并由"保存到内容库"写回；frontmatter 可对每个字段选择基线、本地或远端并把结果写进同一份文本；附件区并列显示远端与本地版本，图片、视频、音频可直接查看，其余提供下载，并可"采用远端"替换本地文件并刷新媒体身份。
- `REQ-CGS-009`：`acceptRemoteNew` 仅接受 `remote-new` 的路径并建立内容与基线；`removeRemoteDeleted` 仅删除 `remote-deleted` 的内容与基线，两种动作都按路径白名单执行并跳过闪念。
- `REQ-CGS-005`：`src/lib/content-repo/state.ts` 按同步基线与远端 blob sha 得出已同步、待推送、待拉取、远端新增、远端删除与合并冲突，并单独列出缺失附件。
- `REQ-CGS-007`：`checkContentRepo` 只解析 ref 与读取树清单，列出差异状态，不写库。`pullContentRepo` 只处理 `to-pull` 的文章：读取目标 blob、解析 frontmatter、写库并推进基线，随后清理搜索缓存；闪念在权威切换前不拉取，附件有变化的条目跳过并给出原因。
- 未实现：`REQ-CGS-001`（Memo 仍由本地文件内容源扫描；剪藏与 MCP 写路径尚未记录媒体身份）、`REQ-CGS-011`（合并落地）、`REQ-CGS-013`（权威切换）、`REQ-CGS-015`（文件树退役与剪藏/MCP 写路径的附件身份）。
- Verification commands: `bun test src/lib/content-repo src/server/services/content-repo-sync.test.ts`（52 pass）；`bun run db:migrations:validate`；`DB_PATH=<tmp> bun run migrate`。
- Rollout facts: 推送入口当前只有管理员 tRPC `contentRepo.status` 与 `contentRepo.push`，没有界面入口，也没有定时任务；权威切换与本地源退役不在本次范围内。

## Coverage / rollout summary

- 本次只新增服务端推送能力，不改变内容读取路径、不停止本地扫描、不改动既有同步任务；迁移期间本地源扫描范围保持不变。

## Remaining Gaps

- 媒体身份已在上传与推送采纳时记录；剪藏资源与 MCP 附件的写入路径仍不记录，读取时也不核对（`REQ-CGS-001`、`REQ-CGS-015`）。
- 拉取、三方合并、远端新增/删除、差异对比与合并界面尚未实现。
- 与真实仓库的 smoke 验证尚未执行；当前只有注入式 transport 与纯函数测试。
- 权威切换（导入 + 停止注册本地源 + 移除判废路径）仍是未排期的一次性发布。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
