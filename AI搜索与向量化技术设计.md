# AI 搜索与向量化技术设计（方案 B：独立向量表）

本设计文档详细说明在现有项目（Next.js App Router + tRPC + Drizzle ORM + SQLite + Bun）中实现 AI 搜索与向量化的技术方案。该方案采用“独立向量表（post_embeddings）”以支持多模型、chunk 级索引与重排序（默认 bge-reranker-v2-m3）。

目标能力：

- 向量化：全量、增量、按 slug 强制向量化；落库到独立表；SSE 实时日志。
- 搜索：Embedding 相似度召回 + Cross-Encoder 重排序 + 可选 LLM 答案生成。
- 管理界面：数据同步页新增“全量/增量向量化”按钮与向量化总览；文章列表显示向量化状态与“强制向量化”。

---

## 1. 架构概览

- 数据库：SQLite + Drizzle。
  - 新增 `post_embeddings` 存储向量及元数据；与 `posts` 解耦。
- 服务层：
  - EmbeddingClient：OpenAI 风格 /v1/embeddings 调用。
  - RerankClient：优先调用 /v1/rerank（如提供）；无则降级策略。
  - EmbeddingsRepository：读写 `post_embeddings`，封装 upsert/查询。
  - VectorizationService：全量/增量/单篇向量化流程、并发与重试、SSE 日志。
  - SearchService：召回（cosine）→ 重排序（bge-reranker-v2-m3）→ 结果融合。
- API：
  - Admin：`admin.vectorize`（触发器、单篇、进度、统计）。
  - Public：`search.ai`（semantic、enhanced、answer）。
- 前端/管理端：复用现有 SSE 通道（`subscribeSyncLogs`），数据同步页与文章列表做最小改造。

时序（简述）：用户在数据同步页点击“全量向量化”→ tRPC 触发 VectorizationService → SSE 推日志 → 数据写入 post_embeddings → 统计刷新；搜索时 query→ 生成查询向量 → 召回 topN → 对 topK 重排序 → 返回结果。

---

## 2. 数据模型

### 2.1 表结构：post_embeddings（Drizzle 定义）

- `id` TEXT PK（nanoid）。
- `postId` TEXT（引用 posts.id）。
- `slug` TEXT（冗余，便于快速定位与 UI 显示）。
- `type` TEXT（post/memo/...）。
- `modelName` TEXT（默认 `BAAI/bge-m3`）。
- `dim` INTEGER（默认 1024）。
- `contentHash` TEXT（对标准化文本的 SHA-256）。
- `chunkIndex` INTEGER NOT NULL（文档级为 -1；开启分片时 0..N）。
- `vector` BLOB（Float32Array → Buffer）。
- `updatedAt` INTEGER（UNIX 毫秒）。

约束与索引：

- 唯一约束：`UNIQUE(postId, modelName, chunkIndex)`（文档级以 `chunkIndex=-1` 作为哨兵，避免 SQLite 对 NULL 唯一性的特殊行为）。
- 常用索引：`INDEX(slug)`, `INDEX(modelName)`, `INDEX(updatedAt)`。
- 外键（逻辑约束）：`post_embeddings.postId` → `posts.id`（SQLite 可选明示）。

### 2.2 状态判定（indexed / unindexed / outdated）

- 构建用于 embedding 的标准化文本 `T(post)` 并计算 `H = SHA256(T(post))`。
- 取该 `postId` + `modelName` 最新记录（或全部 chunk）比较 `contentHash`：
  - unindexed：无任何记录；
  - outdated：存在记录但 `contentHash != H`；
  - indexed：存在且所有记录的 `contentHash == H`（文档级或 chunk 级一致）。

说明：当启用 chunk 时，参考最新一轮向量化写入的所有 chunk 行；`contentHash` 对应全文 hash，便于整体判定是否过时。

---

## 3. 文本构建与分片

标准化文本拼接（UTF-8）：`title` + `\n\n` + `excerpt?` + `\n\n` + `body` + `\n\n` + stable JSON(meta: category/tags/author/...)。

分片（默认启用）：

- 策略：按字符长度切分，`chunkSize=1400`，`overlap=200`（可配置），尽量不跨标题行；优先在换行/句号处分割。
- hash：所有 chunk 共用全文 `contentHash = SHA256(T(post))`；
- chunkIndex：0..N；向量召回以 chunk 为粒度，返回时合并为文章级结果（取最高分或加权平均）。

---

## 4. 客户端与工具

### 4.1 EmbeddingClient（OpenAI 风格）

- 依赖：`OPENAI_API_BASE_URL`、`OPENAI_API_KEY`、`EMBEDDING_MODEL_NAME`、`EMBEDDING_DIMENSION`。
- 请求：POST `${OPENAI_API_BASE_URL}/v1/embeddings`，body `{ model, input }`。
- 响应：`data[0].embedding` 数组；校验长度 == `EMBEDDING_DIMENSION`；转为 Float32Array。
- 并发：`MAX_EMBED_CONCURRENCY`（默认 3）；指数退避重试；错误落库并写日志。

### 4.2 RerankClient（Cross-Encoder）

- 依赖：`RERANKER_MODEL_NAME=bge-reranker-v2-m3`、`RERANKER_TOP_K`、`RERANKER_BATCH_SIZE`。
- 首选接口：`${OPENAI_API_BASE_URL}/v1/rerank`（若服务商提供 OpenAI 风格 rerank）。
  - 请求：`{ model, query, documents: string[], top_n?: number }`；
  - 响应：`{ data: [{ index, document, score }] }`；
- 不启用任何降级策略：若 /v1/rerank 不可用或未配置，调用将返回明确错误（RERANKER_UNAVAILABLE），由上层（API 层或前端）决定提示或改用纯召回接口。

### 4.3 序列化与相似度

- `buildEmbeddingInput(post)`：按 3 节规则拼接；
- `hashEmbeddingInput(text)`：SHA-256（十六进制）；
- `cosineSimilarity(a,b)`：标准余弦；
- `scoreFusion(cosine, rerank)`：`final = α * cosine_norm + β * rerank_norm`（默认 α=0.3, β=`RERANKER_WEIGHT`=0.7；归一化按 min-max）。

---

## 5. 服务与流程

### 5.1 EmbeddingsRepository

- `upsert(postId, slug, type, modelName, dim, contentHash, chunkIndex|null, vector)`
- `getByPost(postId, modelName)`：返回该文章该模型的所有 chunk 记录；
- `getLatestUpdatedAt(modelName)`：统计；
- `getVectorizationStatus(postId, modelName, currentHash)`：indexed/unindexed/outdated；
- `stats(modelName)`：总行数、按状态汇总、最后更新时间。

### 5.2 VectorizationService

- 输入：`mode: full|incremental`、`model=modelName`、`chunking: boolean=true`（默认启用分片，亦可通过环境变量开关）。
- 全量：扫描 `posts`（type in {post,memo} 可配置）；
- 增量：仅处理 “unindexed/outdated”；
- 单篇：按 slug 定位 post → 全文或分片 → 写入；
- SSE：
  - `syncEventManager.startSyncSession('vectorize')`；
  - 进度/日志：`sourceType='ai' | 'vector'`，`operation='vectorize'`；
  - 完成：`syncEventManager.completeSyncSession(success, stats)`；
- 事务：每批 N 条提交（N=20，可配置）以降低锁持有时间。

### 5.3 SearchService

- `semantic({ q, topK=50, type=all, publishedOnly=true, model=EMBEDDING_MODEL_NAME })`
  - 生成查询向量 → 扫描 `post_embeddings`（按 type/public 过滤）→ 逐条计算 cosine 相似度；
  - 文档级：直接排序；chunk 级：按 `slug` 聚合（取最大或加权平均）；
  - 返回前 topK（含 matchedSnippet）。

- `enhanced({ q, topK=50, rerankTopK=20, rerank=true })`
  - 先 `semantic` 得到候选；
  - 若 `rerank=true` 且有 `RERANKER_MODEL_NAME`：取 `rerankTopK` 文档，准备 `{query, documents}` 调用 RerankClient；
  - 分数融合得到最终排序；
  - 返回结果集（含原 cosine、rerank、final）。

- `answer({ q, k=8 })`
  - `enhanced` 取前 k 结果，拼接上下文调用 `CHAT_MODEL_NAME` 生成摘要，返回带引用的答案。

---

## 6. tRPC API 设计

命名：

- Admin：`admin.vectorize`
  - `triggerVectorize`: `{ isFull: boolean, model?: string, chunking?: boolean } → { stats, startedAt, finishedAt }`
  - `vectorizeBySlug`: `{ slug: string, model?: string, chunking?: boolean } → { updated: boolean }`
  - `getVectorizeProgress`: `→ { status, progress, currentStep, processedItems, totalItems } | null`
  - `getVectorizationStats`: `→ { indexed, outdated, unindexed, lastIndexedAt, model, dim }`

- Public：`search.ai`
  - `semantic`: `{ q, topK?, type?, publishedOnly?, model? } → Result[]`
  - `enhanced`: `{ q, topK?, rerankTopK?, rerank?, model?, rerankerModel? } → Result[] | RERANKER_UNAVAILABLE`（当 `rerank=true` 且未配置或无法访问 rerank 服务时返回明确错误，不做降级）
  - `answer`: `{ q, k?, model?, rerankerModel? } → { answer, citations }`

SSE：复用 `admin.contentSync.subscribeSyncLogs`，后端以 `sourceType='ai'|'vector'`、`operation='vectorize'` 区分事件，UI 无需改动订阅。

---

## 7. 配置与环境变量

- 必选：
  - `OPENAI_API_BASE_URL`
  - `OPENAI_API_KEY`
  - `EMBEDDING_MODEL_NAME=BAAI/bge-m3`
  - `EMBEDDING_DIMENSION=1024`
  - `CHAT_MODEL_NAME=deepseek-v3`
- 可选/建议：
  - `RERANKER_MODEL_NAME=bge-reranker-v2-m3`
  - `RERANKER_TOP_K=20`
  - `RERANKER_BATCH_SIZE=8`
  - `RERANKER_WEIGHT=0.7`
  - `MAX_EMBED_CONCURRENCY=3`
  - `EMBED_CHUNKING_ENABLED=true`（默认启用分片）
  - `EMBED_CHUNK_SIZE=1400`
  - `EMBED_CHUNK_OVERLAP=200`

---

## 8. 前端改造

### 8.1 数据同步页（`src/components/admin/ContentSyncManager.tsx`）

- 新增按钮：
  - “全量向量化”：`trpc.admin.vectorize.triggerVectorize({ isFull: true })`
  - “增量向量化”：`trpc.admin.vectorize.triggerVectorize({ isFull: false })`
- 总览面板：展示 `getVectorizationStats()`（indexed/outdated/unindexed/lastIndexedAt/model）。
- 日志：沿用现有 SSE 区域；显示 `sourceType='ai'|'vector'` 与 `operation='vectorize'`。

### 8.2 文章列表页（`src/components/admin/AdminPostsManager.tsx`）

- 新增列“向量化”：基于 `post_embeddings` 计算状态：
  - 未索引（灰）、已索引（绿）、过时（橙）。
- 行操作：新增“强制向量化”→ `trpc.admin.vectorize.vectorizeBySlug({ slug })`，成功后刷新。

---

### 8.3 前端回退策略（RERANKER_UNAVAILABLE）

- 行为：当前端调用 `search.ai.enhanced` 且返回 `RERANKER_UNAVAILABLE` 时，自动回退调用 `search.ai.semantic` 并以“仅召回结果”呈现。
- 提示：在结果列表顶部展示轻提示“重排序服务不可用，已显示仅召回结果”，3–5 秒后自动消失；不阻断用户。
- 记录：为本次查询标记 `mode=semantic-only`（便于埋点/调试）。

---

## 9. 性能与容量

- 向量存储：Float32Array → BLOB；按 chunk 控制条目数量。
- 召回：内存计算 cosine（体量小），必要时引入 sqlite-vec/外部向量库。
- 并发：embedding 并发 2-4；重排序分批 8；指数退避重试。
- 缓存：可按查询向量 hash 做短期缓存（可选）。

---

## 10. 失败与重试

- 接口失败：指数退避（100ms→3s 上限），记录 error_message；
- 维度不符：跳过该条并标记日志；
- 单篇失败不阻断总体任务；最终统计返回失败计数。

---

## 11. 安全

- 向量化触发接口走 `adminProcedure`，校验管理员身份；
- 搜索接口仅返回 `draft=false && public=true` 内容；
- 审计：所有操作写入 `content_sync_logs`。

---

## 12. 迁移与发布

1) Drizzle 迁移：创建 `post_embeddings`、索引与唯一约束；
2) 首次上线：Admin 触发“全量向量化”；
3) 可选：从历史 `vectorized_files` 迁移（按 slug 合并），然后弃用历史表。

---

## 13. 测试计划与验收

- 单元：
  - 文本构建与 hash、cosine 相似度、分数融合、chunk 切分边界；
  - Embedding/Rerank 客户端维度与响应校验。
- 集成：
  - 触发全量/增量/单篇向量化 → SSE 日志可见 → DB 写入 post_embeddings；
  - 搜索 semantic/enhanced/answer：召回、重排、融合正确，过滤草稿生效。
- E2E：
  - 后台数据同步页按钮与统计展示；
  - 文章列表状态徽章、强制向量化操作正确更新。

验收标准（与需求对齐）：

1) post_embeddings 表存在并具备唯一约束 `(postId, modelName, chunkIndex)`（文档级使用 `chunkIndex=-1`）；
2) 能正确判定每篇文章“未索引/已索引/过时”；
3) Admin 可触发三类向量化并观察到 SSE 实时日志；
4) 搜索接口支持召回与 bge-reranker-v2-m3 重排序，返回融合分；
5) UI：数据同步页新增按钮与统计；文章列表展示状态与“强制向量化”。

---

## 14. 可选后续

- 引入 sqlite-vec/外部向量库；
- 支持多模型并行索引、A/B 实验与在线学习；
- LLM 答案优化：引用精排、多段摘要与高亮。
