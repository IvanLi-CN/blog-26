# FS-only 迁移演练（测试环境）

本 Runbook 用于在**测试环境**完成一次“从含 WebDAV 痕迹的数据 → FS-only 可运行”的完整演练，目标是把低级操作错误尽量前置暴露（包含：备份、dry-run 评审、apply、扫描校验、FS-only 启动与回滚）。

> 约定：本 Runbook 不包含任何真实凭据；所有路径均使用占位符。

## 0. 目标与通过标准

通过标准（全部满足才算演练通过）：

- 迁移后扫描：内容与 DB 中均**不存在** `/api/files/` 的落盘引用
- FS-only 启动：在不配置 `WEBDAV_URL` 的情况下系统可启动
- 核心页面验证：文章列表/详情、memos 列表/详情、图片/附件均可访问

## 1. 准备数据集（必须可回滚）

你需要一份“可回滚”的测试数据集：

- 内容根目录（FS）：`<CONTENT_ROOT>/{blog,projects,memos}/...`
- SQLite：`<DB_PATH>`

强制要求：演练前先做备份（同盘即可，但必须是**独立目录**）。

示例（伪命令）：

```bash
export CONTENT_ROOT="/path/to/content-root"
export DB_PATH="/path/to/sqlite.db"
export BACKUP_DIR="/path/to/backup/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
cp -a "$CONTENT_ROOT" "$BACKUP_DIR/content-root"
cp -a "$DB_PATH" "$BACKUP_DIR/sqlite.db"
```

## 2. 设置 FS-only 环境变量

```bash
export CONTENT_SOURCES=local
export LOCAL_CONTENT_BASE_PATH="$CONTENT_ROOT"
export DB_PATH="$DB_PATH"

unset WEBDAV_URL WEBDAV_USERNAME WEBDAV_PASSWORD
```

## 3. 迁移前扫描（必须记录输出）

```bash
bun run content:scan-api-links --include-db --format human
```

预期：

- 可能 `found: true`（说明有历史 `/api/files/...` 需要迁移）
- 输出包含 markdown/db 的计数与样例

## 4. 迁移 dry-run（必须 review 样例）

```bash
bun run content:migrate-api-links --include-db --dry-run --backup-dir "$BACKUP_DIR/migrate-preview"
```

Review 要点：

- 路径转换是否符合“持久化相对路径”规则（例如 `./assets/<file>` / `../...`）
- 是否出现明显越界路径（例如 `../../..`）
- 计划修改的文件/记录数量是否符合预期

## 5. 迁移 apply（必须可回滚）

```bash
bun run content:migrate-api-links --include-db --apply --backup-dir "$BACKUP_DIR/migrate-apply"
```

约束：

- `--apply` 必须提供 `--backup-dir`（用于写入前的备份与审计）

## 6. 迁移后扫描（必须 0 发现，否则禁止继续）

```bash
bun run content:scan-api-links --include-db --fail-on-found
```

预期：退出码为 `0`。

## 7. FS-only 启动与自动化验证

### 7.1 质量门槛

```bash
bun run check
bun run test
E2E_FS_ONLY=1 bun run test:e2e
```

### 7.2 人工 smoke（最小但必须）

- 文章：打开任意 2 篇（列表/详情/封面图/正文图）
- memos：打开任意 2 条（列表/详情/附件图）

## 8. 回滚预案（任何一步失败立刻执行）

回滚策略：用备份覆盖恢复（内容根目录 + SQLite），然后重新扫描确认恢复到演练前状态。

示例（伪命令）：

```bash
rm -rf "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/content-root" "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/sqlite.db" "$DB_PATH"

bun run content:scan-api-links --include-db --format human
```

