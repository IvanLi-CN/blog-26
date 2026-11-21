# 内容库与内容仓库双向同步 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 未开始。本主题只有需求契约，没有运行时代码、迁移或配置变更。
- Lifecycle: active
- Catalog note: 取代 [本地内容源真实目录布局](../local-real-content-layout/SPEC.md) 的内容来源部分。

## Implementation Coverage

- Requirement coverage: 尚无实现。已确认的落点是设计约束，不是已交付能力：
  - `REQ-CGS-001`、`REQ-CGS-015`：内容与媒体字节入独立内容寻址表，媒体只经只读路由提供；媒体字节不得作为 `posts` 列，因为 `src/server/services/tag-content.ts` 对 `posts` 执行无列名的 `select()`。
  - `REQ-CGS-002`：GitHub 交互复用 `src/lib/playbook/github-source.ts` 的 transport 形态（sha 媒体类型、字节上限、受控错误），写侧新增 Git Data API 能力。生产镜像不含 `git`（`Dockerfile` 只安装 `curl ca-certificates sqlite3 gosu` 与运行库），本主题不引入。
  - `REQ-CGS-003`、`REQ-CGS-004`：规范化实现与基线表为本主题新增；`posts.filePath` 保留为逻辑内容键与仓库路径，不再是磁盘事实。
  - `REQ-CGS-006`、`REQ-CGS-007`、`REQ-CGS-008`、`REQ-CGS-009`：推送、检查、拉取与合并为新增服务端能力；直接复用 `src/server/services/content-tasks.ts` 的租约与执行归属，不新造调度。
  - `REQ-CGS-012`：串行沿用 `content-tasks` 的单飞与 ownership，不引入第二套队列。
  - `REQ-CGS-013`：切换前的不变量为 `src/lib/content-sources/register.ts` 的注册条件、`src/config/paths.ts` 的扫描根、`src/lib/content-sources/manager.ts` 的全量判废谓词，以及 `src/server/jobs/definitions.ts` 每 30 分钟的增量同步任务。
  - `REQ-CGS-016`：错误分类对齐既有 `unconfigured/current/checking/stale/failed/invalid/unavailable` 词表的语义分层，但差异是本主题新增状态，不复用失败语义。
- Verification commands: 尚未建立。测试形态计划对齐既有 `src/lib/playbook/github-source.test.ts` 的注入式 transport fixture。
- Rollout facts: 未规划上线。一次性导入必须是停机窗口内的启动前步骤，不能写成只读 SQL 迁移。

## Coverage / rollout summary

- 当前没有可交付代码；本主题只固定了边界、状态语义与切换顺序。

## Remaining Gaps

- 全部需求未实现。
- 媒体字节存放、合并界面位置与依赖选型在规范中已定，但尚未验证实际构建体积、编辑器集成与移动端布局。
- 本地内容源退役、管理端文件树与内容文件读写接口的移除尚未排期。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
