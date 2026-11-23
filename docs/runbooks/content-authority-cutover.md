# 内容权威切换到数据库

本 runbook 把内容库从"本地文件扫描 + 数据库写入"切换为"数据库唯一权威"，并保持媒体文件在原内容根中作为媒体存储。切换必须一次完成，导入不得在服务运行期间执行。

## 前置条件

- 已发布的镜像包含 `scripts/content-cutover.ts`、`scripts/content-repo-seed.ts` 与 `CONTENT_AUTHORITY` 开关。
- 内容根仍挂载在 `LOCAL_CONTENT_BASE_PATH`，切换后它只承担媒体读取与写入，不再被扫描。
- 已备份 SQLite 数据库；盘上内容文件不需要备份，导入不会改写或删除它们。
- 如要同时初始化内容仓库：已创建私有空仓库，并在服务端配置 `CONTENT_REPO_REPOSITORY`、`CONTENT_REPO_REF`、`CONTENT_REPO_TOKEN`。

## 步骤

1. 停止服务，冻结写入。

   ```bash
   cd /path/to/stack
   docker compose stop blog
   ```

2. 备份数据库并记录当前镜像。

   ```bash
   sqlite3 data/sqlite.db ".backup 'data/sqlite._backup_$(date +%Y%m%d%H%M%S).db'"
   docker inspect blog --format '{{.Image}}' > data/image._backup_$(date +%Y%m%d%H%M%S).txt
   ```

3. 在一次性容器里先跑 dry-run，核对导入数量、附件搬迁与孤立行。

   ```bash
   docker compose run --rm --entrypoint bun blog ./scripts/content-cutover.ts
   ```

   预期：文章与 Memo 数量与库内行一致；`errors` 为空；`orphans` 为空（除非确认要 `--remove-orphans`）。Syncthing 冲突副本出现在 `skipped`。

4. 执行导入。

   ```bash
   docker compose run --rm --entrypoint bun blog ./scripts/content-cutover.ts --apply
   ```

   导入会：把正文与媒体引用规范化为仓库形态，把附件复制到 `<kind>/assets/`，记录附件 sha/大小，写入 `content_authority` 标记。重复执行会直接返回 `completed`。

5. 打开权威开关并启动。

   ```yaml
   environment:
     CONTENT_AUTHORITY: database
     LOCAL_CONTENT_BASE_PATH: /app/data/local
   ```

   ```bash
   docker compose up -d blog
   ```

   开关生效后不再注册本地内容源，增量/全量同步任务与判废路径都不会运行，管理端触发本地同步会被拒绝。`LOCAL_CONTENT_BASE_PATH` 必须保留，媒体读取与写入依赖它。

6. 初始化内容仓库（可选，需要 token）。

   ```bash
   docker compose exec blog bun ./scripts/content-repo-seed.ts
   ```

   脚本按仓库单批上限分批推送，每批形成一个提交；完成后管理端检查应为 `synced`。

7. 验收。

   - 管理端内容列表数量与导入报告一致，随机抽查文章与 Memo 正文。
   - 站点列表、详情、搜索、Memo 流与媒体图片正常。
   - 等待一个原扫描周期（30 分钟），确认没有新的同步任务运行。
   - 编辑一篇内容并保存，随后确认内容未被回填。

## 回滚

1. `docker compose stop blog`
2. 恢复备份：`cp data/sqlite._backup_<时间>.db data/sqlite.db`
3. 移除 `CONTENT_AUTHORITY=database`，用备份记录中的镜像启动
4. 内容根中的原始文件全程未改动；导入新增的 `<kind>/assets/` 副本可保留

## 边界

- 项目行不会进入内容仓库；切换后项目正文只在库内维护。
- Syncthing 冲突副本不参与导入，也不会进入仓库。
- 仓库由导入后的库内容经 GitHub API 单批提交生成，服务端不创建本地 clone。
