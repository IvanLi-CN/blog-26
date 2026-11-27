# 内容向量随内容删除 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: in progress
- Lifecycle: active
- 迁移、schema 声明、`rag-index` 跳过逻辑、`missing-local-content` 分支清理、定向测试与文档已落分支，尚未合入 main，未在部署环境生效。

## Implementation Coverage

- `drizzle/0038_post_embeddings_foreign_key.sql`：依次删除归一化后无主的行、删除被标准键覆盖的重复遗留行、归一化剩余 `post_id`，再重建 `post_embeddings` 携带 `FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE`，随后重建三个既有索引。
- `drizzle/meta/_journal.json`：登记 idx 38。
- `src/lib/schema.ts`：`postEmbeddings.postId` 声明 `.references(() => posts.id, { onDelete: "cascade" })`。
- `src/server/services/rag-index.ts`：最终事务内先检查所属 `posts` 是否存在；缺失时把 `rag_index_targets` 标记为 `skipped`，计入任务 `skipped` 计数，避免中断整批索引。
- `src/server/services/content-repo-sync.ts`：`missing-local-content` 分支按 `item.path` 及其遗留斜杠变体显式删向量；`posts` 行已不存在时级联无从触发。
- `src/server/services/post-embeddings-foreign-key.test.ts`：直接执行迁移文件，覆盖七条边界——级联外键声明、存量孤儿清理、删除级联、孤儿插入被拒绝，以及遗留斜杠键的归一化、重复让位、归一化后仍无主的行被删除。

## 验证（脱敏全库副本，隔离环境）

验证在一次性隔离环境中完成。副本由一份脱敏的全库导出还原，包含完整 schema（全部表、触发器、索引、FTS5 虚拟表）与真实的数据分布，但已移除任何可识别部署或内容的信息。线上库全程只读，未执行任何写操作。

- 迁移路径：直接调用仓库的 `bun ./scripts/migrate.ts`，与容器入口同一路径（含 drizzle `BEGIN…COMMIT` 与版本表推进）。
- 构成：标准键、真孤儿、带前导斜杠的遗留键三类并存；遗留键中大部分是被标准键覆盖的重复行，少数是唯一覆盖行。
- 迁移结果：无主行与重复行被删除，唯一覆盖行被归一化保留；`slashed_left = 0`、`orphans = 0`、`PRAGMA foreign_key_check` 零违规；全部触发器与 FTS 数据完好。
- 覆盖率：迁移前仅靠遗留键覆盖的文章，迁移后仍保有全部向量。
- 迁移脚本耗时在百毫秒量级；并发写压力下仍在秒级完成，写入零失败，未出现 `SQLITE_BUSY`。
- 行为验证：删除 `posts` 行级联清空向量；无主 `post_id` 与遗留斜杠键均被外键拒绝；`posts` 更新后 FTS 触发器照常工作。
- 破坏性对照：同一副本改用初版裸键判定，唯一覆盖行被一并删除，对应文章覆盖率归零。

## 已知未覆盖

- 遗留斜杠键的写入源头未定位。斜杠行集中出现在一段早期时间窗口内，之后新写入均为标准键，说明写入方已修复或该路径已不再执行；迁移完成归一化后，未来若再写入斜杠键，外键会直接拒绝而非静默产生孤儿。
- `src/server/services/content-cutover.ts` 的孤儿清理仍只删 `posts`，级联会接管，未单独改。
- `admin/posts.ts`、`memos.ts`、`mcp.ts` 各删除路径同样由级联接管，未加显式语句。
- 迁移尚未在任何部署库上执行；执行前须确认可用空间与备份策略。

## Test contract changes

外键使「孤儿向量」不可构造，两处既有测试按新契约改写：

- `rag-index.test.ts`：原断言孤儿行不产生内容，现断言插入孤儿被 `FOREIGN KEY constraint failed` 拒绝。
- `llm-settings.test.ts`：原插入孤儿行验证提示，现仅用活行验证提示逻辑。

## 已知副作用：管理面板提示会重新出现

被归一化保留的少数行，其 `updated_at` 早于最近一次嵌入配置变更。`embeddingReindexSuggested` 比较「配置变更时间 > 最老向量时间」，因此迁移后该提示会重新显示。

这个提示**这次是真的**：这些向量确实产生于旧 provider 配置之下。它们的 `content_hash` 与当前正文完全一致，模型也未变，所以检索仍可用；提示只是如实反映「有一批向量早于最近一次配置变更」。

不采用的做法：删除这些行以让提示消失（等于用丢覆盖换安静），或篡改 `updated_at`（伪造数据）。若要消除提示，正确做法是执行一次增量向量化，由 `vectorizeAll` 重嵌对应文章的相关 chunk。

## Rollout

- 零停机：迁移重建单表，实测并发写延迟可控；不改 `journal_mode`。
- 生效前提为 `PRAGMA foreign_keys = ON`（`src/lib/db.ts:31` 已开启）；外部 `sqlite3` 客户端默认关闭，绕过应用直连写入不受约束保护。
