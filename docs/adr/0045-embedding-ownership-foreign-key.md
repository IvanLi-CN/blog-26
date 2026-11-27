---
status: accepted
---

# 用外键约束维护向量归属

## Context

`post_embeddings` 以 `post_id` 指向 `posts.id`，但两表之间没有引用约束。删除文章或 memo 时，删除路径只执行 `DELETE FROM posts`，孤儿向量永久残留。

实际数据比原始判断复杂，存在三类行：

- 键与 `posts.id` 完全一致，可直接挂外键。
- 指向已删对象，是真孤儿；其中既有带遗留斜杠的，也有不带的。
- **早期写入遗留的前导斜杠键**（`/<path>` 对 `<path>`），其对象大多仍存在。这类行大部分与同内容的标准键行重复，但也有少数是该 chunk 的唯一覆盖。

直接按 `post_id NOT IN (SELECT id FROM posts)` 清理会把后两类一起删掉：重复行无害，但唯一覆盖行会让对应文章**失去语义检索**。迁移因此先归一化再比较。

残留代价分两面。存储永不回收；`min(updated_at)` 会被最老孤儿拖住，使管理面板 `embeddingReindexSuggested` 长期误报。误报已由 `innerJoin(posts)` 修复，存储问题仍在。

反向价值：孤儿行是缓存。`vectorizeAll` 以 `(postId, modelName, chunkIndex)` 比对 `contentHash` 决定跳过，同一 id 恢复同一内容可零点复用。

系统没有软删除或回收站，恢复内容是手工事故补救。

## Decision

`post_embeddings.post_id` 声明 `REFERENCES posts(id) ON DELETE CASCADE`，由数据库维护归属。

选择外键而非触发器的理由：约束属于 schema，不依赖某条删除语句是否被执行；它是声明式的，任何写入方——包括将来新增的删除路径——都由数据库拒绝或级联。触发器只能覆盖被显式挂上的删除动作，且不可见、不可记日志、把 SQLite 的 `OLD.id` 语法写进迁移。

这个仓库本就以 `.references(..., { onDelete: "cascade" })` 表达归属（`readers.id`、`users.id`、`frontendUsers.id` 等多处）。`post_embeddings` 无约束才是孤例，补上它是收敛而非引入新范式。

SQLite 只在建表时读取外键声明，因此迁移重建 `post_embeddings`：先删除存量孤儿，再建带约束的新表、复制存活行、改名、重建三个索引。

迁移顺序为：删除归一化后无主的行 → 删除被标准键覆盖的重复遗留行 → 归一化剩余键 → 重建表并挂外键。第三个删除不可省略：不先去重，`UPDATE` 归一化会撞唯一索引。

在隔离环境中用一份脱敏的全库副本验证（完整 schema 含触发器与 FTS5，经 `bun ./scripts/migrate.ts` 执行，与容器入口同一路径）：迁移只删除无主行与被标准键覆盖的重复行，唯一覆盖行被归一化保留；级联删除、孤儿拒绝、触发器共存、归一化后外键零违规均通过。耗时与并发写延迟在秒级以内，未出现 `SQLITE_BUSY`。

归一化后外键成立的前提是键与 `posts.id` 逐字节一致，因此约束本身也杜绝此类遗留键再次产生：写入方若仍用斜杠键，插入会被直接拒绝，而不是静默累积。

外键生效依赖 `PRAGMA foreign_keys = ON`，仓库已在 `src/lib/db.ts:31` 开启。

## Consequences

写入方必须保证所属 `posts` 行存在，否则插入直接失败。`rag-index.ts` 在最终事务内先检查 `posts` 是否存在，缺失时把目标标记为 `skipped` 并计入任务 `skipped` 计数，避免因内容已删而中断整个索引任务。

孤儿状态从此不可被构造。原本依赖"手工插入孤儿行"的测试改判契约：`rag-index.test.ts` 断言插入被拒绝，`llm-settings.test.ts` 改用纯活行验证提示逻辑。

删除即失去复用缓存；同一内容重新导入会重嵌全部 chunk。

约束在数据库层自解释，读 schema 即可发现关系，不需要额外文档指路。

## Rejected alternatives

**SQLite 触发器**：不重建表、迁移更轻，但约束只对被显式挂上的删除动作生效，新删除路径若不复用触发器则继续泄漏；触发器不可见，删除后应用层拿不到行数与 `post_id`，无法记审计日志；`OLD.id`、`BEGIN...END` 等语法会把迁移绑死在 SQLite。

**计划任务定期清理**：需要新写反连接查询，`vectorizeAll` 只遍历现存 `post`，增量同步顺带清不掉；唯一可判年龄字段是向量自身 `updated_at` 而非删除时间，只能滞后猜测。另有正确性缺口：`posts.id` 是文件路径，内容迁路径时旧 id 会被误判为孤儿提前删除。

**应用层显式删除**：无数据库特有语法、可记日志，但漏写一处就漏删，且无法阻止绕过代码的直连写入。作为外键的补充保留在 `admin/files.ts` 的作用域删除与 `content-repo-sync.ts` 的 `missing-local-content` 分支中，其余路径由级联覆盖。
