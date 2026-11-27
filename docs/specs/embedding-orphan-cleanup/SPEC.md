# SPEC: 内容向量随内容删除

- Spec ID: `vecdel`
- Status: `active`
- Owner: `main-agent`

## 1. Background

`post_embeddings` 存放每篇文章与每条 memo 的 chunk 向量，以 `post_id` 指向 `posts.id`，但两表之间没有引用约束。多数删除路径只执行 `DELETE FROM posts`，向量行永久残留；按作用域删除的路径另有手工清理（见 REQ-VECDEL-005）。

实测数据并非全是孤儿，而是三类并存：

- 键与 `posts.id` 一致。
- 真孤儿，即对象已删；最新一条产生于近期，证明泄漏仍在持续。
- 带前导斜杠的遗留键（`/<path>` 对 `<path>`），早期写入遗留。其中多数与标准键行重复，少数是该 chunk 的唯一覆盖。

按裸键比较清理会连同唯一覆盖行一起删除，使对应文章失去语义检索。

残留分两层代价。存储持续增长且永不回收；`min(updated_at)` 被最老孤儿拖住，使管理面板 `/admin/llm-settings` 的 `embeddingReindexSuggested` 长期误报。误报已由统计改为 `innerJoin(posts)` 消掉，但存储继续增长。

反向价值需要保留考虑：孤儿行是缓存。`vectorizeAll` 以 `(postId, modelName, chunkIndex)` 比对 `contentHash` 决定跳过，用同一 id 恢复同一内容可以零点复用；删行则要重嵌全部 chunk。

系统没有软删除，也没有回收站，`posts` 无 `deletedAt` 列，删除即 `DELETE`。恢复内容是手工事故补救，不是常规操作。

## 2. Goals

1. 文章或 memo 被删除时，其内容向量同步消失。
2. 离开应用的删除路径不再需要逐处手写清理语句。
3. 迁移内重建 `post_embeddings` 以携带外键，不改变 `journal_mode`。
4. 存量孤儿向量在迁移内一次性清理：删除真孤儿与被标准键覆盖的重复遗留行，保留并归一化唯一覆盖行。
5. 结构关系可被发现：新读者能从 schema 与 ADR 找到约束从何而来。

## 3. Non-goals

- 计划任务定期清扫。定时清理与即时删除并存会制造两套真相，且没有可靠的"过期"字段可判。
- 软删除或回收站。
- 数据库触发器。约束只对显式挂上的删除动作生效，且删除后应用层拿不到任何信号。
- 处理 `vectorized_files`，实际无数据且无写入方，是死表。
- 处理 `search_semantic_embeddings`，保留行全为 playbook，生命周期跟随 `editionDigest`，与内容删除无关。
- 删除即失去缓存后的补救（如保留墓碑行供复用）。

## 4. Requirements

### REQ-VECDEL-001

`posts` 行被删除时，`post_embeddings` 中 `post_id` 等于该行的所有记录必须在同一事务语义内被删除。

### REQ-VECDEL-002

机制为 `post_embeddings.post_id` 上的 `REFERENCES posts(id) ON DELETE CASCADE`，由数据库维护归属；不得依赖各删除路径逐处调用清理。

### REQ-VECDEL-003

迁移按以下顺序执行，任一环颠倒都会破坏数据：先删除归一化后无主的行，再删除被标准键覆盖的重复遗留行，随后归一化剩余键，最后重建表携带外键并重建三个索引。

不得直接用 `post_id NOT IN (SELECT id FROM posts)` 判定孤儿：遗留键带前导斜杠，裸比较会把仍有对象指向的有效向量误判为孤儿。去重也不可省略，否则归一化会撞 `post_embeddings_uq_post_model_chunk`。

### REQ-VECDEL-004

`posts` 行已不存在、级联无从触发的路径必须显式清理。至少覆盖 `content-repo-sync.ts` 的 `missing-local-content` 分支。

### REQ-VECDEL-007

`rag-index` 在写入向量前必须确认所属 `posts` 行存在；缺失时把目标标记为 `skipped` 并计入任务 `skipped` 计数，不得让插入失败中断整个索引任务。

### REQ-VECDEL-005

按作用域删除的既有手工清理（`admin/files.ts` 按 `filepath`）保留，与级联重复但幂等。

### REQ-VECDEL-006

`schema.ts` 的 `post_embeddings.postId` 必须通过 `.references(() => posts.id, { onDelete: "cascade" })` 声明归属，与仓库既有外键写法一致。

## 5. Validation

- 迁移可在空库触发，`bun run migrate` 通过。
- 定向测试覆盖七条边界：迁移声明级联外键；迁移删除存量孤儿；删除 post 级联清空其向量；所属 post 不存在时插入被拒绝；遗留斜杠键被归一化而非删除；重复遗留行让位给标准键行；归一化后仍无主的行被删除。
- 重建耗时与并发写延迟须在脱敏的库副本上确认，不得在线上库直接测。
- `bun run check` 与 `bun run db:migrations:validate` 通过。
- 发布前在库副本上实测迁移耗时，确认无长时间写锁。

## 6. References

- [ADR 0045](../../adr/0045-embedding-ownership-foreign-key.md)
- `src/lib/ai/vectorization.ts`（复用判定）
- `src/lib/db.ts`（`PRAGMA foreign_keys = ON`，外键生效前提）
- `src/lib/schema.ts`（既有 `.references(..., { onDelete: "cascade" })` 写法）
