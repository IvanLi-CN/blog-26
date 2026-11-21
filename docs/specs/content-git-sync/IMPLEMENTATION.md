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

- 未实现：`REQ-CGS-001`（Memo 与媒体仍来自本地文件）、`REQ-CGS-005`（完整差异状态仅实现推送侧所需部分）、`REQ-CGS-007`（拉取）、`REQ-CGS-008`（三方合并）、`REQ-CGS-009`（远端新增与删除）、`REQ-CGS-011`（合并落地）、`REQ-CGS-013`（权威切换）、`REQ-CGS-015`（差异对比界面与文件树退役）。
- Verification commands: `bun test src/lib/content-repo src/server/services/content-repo-sync.test.ts`；`bun run db:migrations:validate`；`DB_PATH=<tmp> bun run migrate`。
- Rollout facts: 推送入口当前只有管理员 tRPC `contentRepo.status` 与 `contentRepo.push`，没有界面入口，也没有定时任务；权威切换与本地源退役不在本次范围内。

## Coverage / rollout summary

- 本次只新增服务端推送能力，不改变内容读取路径、不停止本地扫描、不改动既有同步任务；迁移期间本地源扫描范围保持不变。

## Remaining Gaps

- 媒体字节仍存放在本地媒体根，尚未迁入内容寻址表（`REQ-CGS-001`、`REQ-CGS-015`）。
- 拉取、三方合并、远端新增/删除、差异对比与合并界面尚未实现。
- 与真实仓库的 smoke 验证尚未执行；当前只有注入式 transport 与纯函数测试。
- 权威切换（导入 + 停止注册本地源 + 移除判废路径）仍是未排期的一次性发布。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
