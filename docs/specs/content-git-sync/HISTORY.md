# 内容库与内容仓库双向同步 主题历史

> 这里记录主题局部生命周期、替换、兼容性与必要背景；完整 ADR 取舍保留在 `docs/adr/`。

## Lifecycle / Compatibility

- 新主题，创建时覆盖既有的本地内容来源假设。
- 与 [Style Playbook 集成](../style-playbook-integration/SPEC.md)方向相反：Playbook 从 GitHub 读取并采用快照，本主题把数据库内容同步到一个对等内容仓库。两条链路互不阻塞、互不共享事件与状态词表。
- 取代 [本地内容源真实目录布局](../local-real-content-layout/SPEC.md) 的内容来源部分：该主题规定由配置的真实目录扫描内容，本主题不再保留任何文件内容来源。

## Replacements / Background

- 起因：编辑器保存只写数据库，而数据库行仍以 `local` 归类并参与全量判废；同时本地源按文件修改时间增量回填。两个写入者并存导致保存可能被覆盖，内容也没有可核对的异地副本。
- 方向决定：数据库为唯一权威；内容仓库为对等副本。同步是双向的，冲突通过差异对比与合并裁决，任何一侧都不自动覆盖另一侧。
- 传输决定：只用 GitHub API，不在服务端创建本地仓库、不落盘凭据、不依赖 `git` 可执行文件。理由是运行镜像不含 `git`，且三方合并的共同祖先应由规范化基线而非仓库提交历史确定。
- 切换约束：迁移期间不得改变已注册源集合、扫描根、判废谓词与权威写入者；权威切换必须在单一发布内完成，导入在服务启动前执行。
- 术语变更：`镜像仓库`、`已推送身份`、`漂移` 已被 `内容仓库`、`同步基线`、`内容差异状态` 取代，见 [术语表](../../../GLOSSARY.md)。

## Related Changes

- None. Record PR, commit, review, and compatibility references here; do not add task history to `SPEC.md`.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
