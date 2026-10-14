# 三种搜索模式的实现

内嵌 Tantivy、独立 RAG、独立查询改写和关键词回退已接入主线产品运行时。长期行为以 [SPEC](./SPEC.md) 为准；固定合成模型样例、原生集成、接口、恢复和 UI 自动化结果见 [验证证据](./VALIDATION.md)。

## Current Status

- Lifecycle: active
- Implementation: candidate complete；文章/Memo 的三种模式与管理策略已实现，跨来源统一检索、截断前筛选、综合排序、Playbook 正文/资源 RAG 候选、版本元信息、异步语义投影和按来源同步管理已接入。当前 Candidate 的 VM 全套验证、视觉确认、审查和 PR 交付门禁仍待完成。
- 排序回归和生产 bundle 的 writer 冲突已修复。重新验收发现改写遗漏 SQLite3 专题，旧质量检查仅检查文字而未证明实际检索；改写提示词与固定合成检索验证已修正，两条实际 AI 链保持原断言通过验收。当前候选的完整证据见验证报告；历史候选只作为诊断记录，不替代当前候选。
- HTTP、tRPC、MCP 与旧 enhanced 的现代分支共用统一执行器，默认关闭智能搜索并执行关键词全文检索；Playbook 通过 edition-bound 服务端适配器进入关键词和现代 RAG，rewrite 仍只为博客补充。旧内容列表及独立 semantic 保留自身职责。
- 支持平台为 linux/amd64；本次不提供 macOS 原生后端，本机前端连接 Linux 开发后端。

## 运行时边界

`src/server/services/content-search.ts` 是模式执行边界。每次请求先取得原始查询的合法关键词集合 K，再决定是否执行独立 AI 链；所有 AI 故障直接使用原始关键词集合返回，索引故障则为受控错误。K 在上限内完整保留，上限已满时补充不能替换它。两条 AI 链分别缓存有效改写或判断，不缓存最终结果集合；每次重新检索并校验当前权限与内容版本。

RAG 独立进行向量检索和候选判断。博客继续读取兼容的 `post_embeddings`，Playbook 使用 `search_semantic_embeddings` 的 source/parent/edition/model/content hash 身份；两者在统一执行器中按同一 RRF 规则合并。Playbook 资源正文使用不可信证据分隔传入模型，模型只能返回已提供候选的相关性、排名和证据；查询改写不读取 Playbook。向量新鲜度使用现有 `buildEmbeddingInput` 或同版公开候选摘要，不能将文件源摘要当作跨版嵌入摘要。向量扫描限制为 10,000 行和 64 MiB，每页 200 行，维度、有限数及当前正文再次核验。关键词集合即使未进入判断窗口仍保全；同版语义投影不足时保留词法命中并报告来源覆盖不足。

改写模型只接收查询与静态策略，一次最多生成 3 个受控表达；不接收目录、正文或检索反馈，不调用向量及 RAG 判断。原始与改写查询分别由引擎排序，再以 RRF 融合有限排名，不直接比较不同查询的 BM25 分数。确定名称别名在关键词层完成，NodeJS/Node.js 不允许改写为无条件 Node。

关键词没有 AI 依赖。`native/search` 使用锁定 Tantivy 0.26.2 和 NAPI-RS，内置 RegexTokenizer 保留 ASCII 名称与其余字符的位置；受控 AST 编译为引擎 Term/Phrase/Boolean 查询及受限词首扩展。引擎在截断前完成匹配，稳定同分排序按 ID；前缀超过 256 个扩展词明确报错，不静默漏掉命中。普通中文连续片段、技术符号、名称边界与 Node 别名由原生一致性程序覆盖。新搜索入口把 NEAR 位置语法委托给旧 SQLite FTS5 执行器，保留既有查询行为。

## 持久投影

新增迁移 `0012_search_modes.sql` 创建 outbox、内容修订号、索引 checkpoint 与搜索设置；posts 和 memo_clippings 的事务内触发器覆盖各写入入口。结构迁移不进行全量历史回填，显式 prepare 在准备阶段补齐历史修订号并分页构造新索引。索引存储在 `SEARCH_INDEX_PATH`，缺省为 `${DB_PATH}.search`，开发、测试、生产目录必须分离。

单 writer 串行处理 outbox；索引持久提交和 reader reload 成功后才保存 SQLite checkpoint。Console 启动入口与打包后的 SSR 在同一进程共享规范化路径对应的投影、writer 和串行队列，受控错误跨 bundle 保持可识别。中间退出后重放幂等，不重复文档。查询记录开始时水位，最多等待 2 秒；未准备、坏索引、版本不匹配、提交失败或内容无法确认时返回明确不可用。请求不会隐式全量重建。启动先准备投影，再启动有界后台追赶。

prepare/rebuild 构建独立 generation，写入并同步 manifest，原子选择新 generation 后追平增量。旧 generation 保留供诊断，维护者在确认不再使用后按准确目录处理；索引可从当前 SQLite 投影重建。剪藏仍检查规范文件的公开状态，模型调用前及返回前重新读取当前权限与修订号。

## 模型设置和 UI

现有模型管理页新增两种独立搜索策略卡片，可启停、继承 chat 或覆盖模型 ID、编辑预算、恢复默认值、保存后运行固定合成样例验证。提供方端点与凭据继续使用既有模型设置，搜索 API 不接收新凭据。搜索策略归本主题；现有提供方、密钥存储及模型目录归 admin-llm-settings。

质量依据绑定模式、有效 chat 配置、RAG embedding 配置、凭据摘要、提示词全文、预算、名称策略、检索策略和固定测试集身份。变化后旧任务不能授予当前策略可用性；两种质量结果独立保存，并发授予不会互相覆盖。验证只使用合成内容，不读取生产目录，任务有界并显示进度和受控失败原因。

改写验证通过独立临时 Tantivy 索引执行生成的表达及原始查询，检查专题内容能被检索、无关节点和泛化 JavaScript 结果被排除；与实际执行器共用受控表达校验。SQLite 与 SQLite3 的字面边界保持不变，概念改写可分别查询相关版本。固定合成正文只进入本地探针，模型仍只接收查询与静态策略，不接收内容或检索反馈。验证结束清理探针目录，不修改生产数据库、索引或进程环境；改写测试集版本独立改变，不撤销有效的 RAG 质量依据。

公开页面使用关闭、RAG、AI 改写三个可访问控件，选择保存在 URL，支持刷新、分享和历史导航；迟到请求不能覆盖新选择。页面现在只发一个带 source/type/mode/edition 的服务端请求，直接渲染统一顺序。AI 补充与关键词命中统一排序，同时保全合法关键词命中；HTTP 保持数组并通过 Search-Requested-Mode、Search-Effective-Mode、Search-Reason、Playbook edition 与来源不完整响应头暴露实际执行状态。新 tRPC/MCP 返回 envelope，旧 enhanced 保持数组及历史参数语义：`rerank=false` 关闭重排但保留语义检索，显式 `rerankerModel` 继续用于旧重排路径。HTTP/new tRPC 缺省 20、上限 100，MCP 缺省 20、上限 50，旧 enhanced/semantic 缺省 50，页面请求 50。

去除相关度百分比，只有实际命中词及其原文位置可高亮。关键词、回退、明确语法和错误空态使用确定性建议。页面证据来自正式路由 Web Demo，组件状态及交互来自 Storybook；Demo 构建与正式构建隔离，不能由正式页面的浏览器开关开启。

## 使用与维护

在 linux/amd64 环境安装依赖并构建原生模块，数据库结构迁移与索引准备分开执行。无需部署独立全文服务。

```bash
bun install --frozen-lockfile
bun run search:native:build
bun run search:native:verify
DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local bun run migrate
DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local bun run search:index prepare
DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local bun run search:index status
DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local bun run search:index check
```

status 只读持久元信息。独立进程执行 prepare、check 或 rebuild 前先停止 gateway/console writer；check 报告当前投影缺失、额外、重复或版本不符，确认故障后使用同一组准确 DB、内容和索引路径运行 `bun run search:index rebuild`，再启动服务。旧 SQLite 索引维护命令仍只维护列表及独立 semantic，不代替 Tantivy 修复。不要将多个服务进程配置为竞争同一个索引 writer。

配置 chat/embedding 后，在现有管理页保存搜索设置并验证两个模式。启用不代表质量通过；未验证或失败时仍可使用关键词。默认 RAG 超时 10 秒、输入/输出 16,384/2,048 token，窗口 20 个内容、每个 2,048 码点；改写超时 5 秒、输入/输出 4,096/1,024 token、最多 3 条表达。提供方需要更多预算时应显式保存并重新验证，不进行自动重试。

实际提供方的固定合成验收可通过 `bun scripts/verify-search-empirical.ts` 执行；它创建隔离临时 DB 和索引，只发送固定样例，保留日志和临时目录用于检查。可显式传 `--rag-timeout-ms 30000 --rag-output-tokens 4096 --rewrite-timeout-ms 30000 --rewrite-output-tokens 4096` 验证其他受支持预算；结果只支持这组策略，不证明默认 5 秒可靠性，不复制生产内容。不要将密钥放入命令行或提交文件。

## Implementation Coverage

| 契约 | 当前覆盖 |
| --- | --- |
| REQ-SREL-001 / 002 | K 容量保全、RRF、原文依据、无关拒绝及修复后的真实专题优先排序已验证。 |
| REQ-SREL-003 / 009 / 013 | 原生匹配矩阵、受控查询测试、SQLite NEAR 兼容及 Node 名称规则已验证。 |
| REQ-SREL-004 / 015 | URL、历史、迟到响应、实际高亮和移动键盘交互通过；视觉确认待完成。 |
| REQ-SREL-005 / 006 | 当前文件权限、模型前/返回前校验、Playbook 公开 catalog/资源边界与来源回归已接入；Web Demo 与 VM 合成 provider 已实测 Topic/Policy 统一结果、同版模型输入和权限隔离。 |
| REQ-SREL-007 / 008 / 014 | 三链独立、原始回退、HTTP/tRPC/MCP 契约及管理员限制通过。 |
| REQ-SREL-010 / 011 / 012 | 修复后的实际模型分别通过 4 个质量样例和 5 类搜索；策略缓存与预算有界，关键词无 AI。 |
| REQ-SREL-016 | linux/amd64 原生编译与异步查询、296 条公开内容成本通过；两种发行镜像仍待验收。 |
| REQ-SREL-017 | 真实事务回滚、SIGKILL、checkpoint 重放、I/O 故障和 generation 切换通过。 |
| REQ-SREL-018 | 管理接口、独立保存、并发质量授予及旧任务失效通过。 |
| REQ-SREL-019 / 020 / 021 | 已接入跨来源 RRF、全局 topK、截断前筛选、统一 HTTP/tRPC/MCP 契约、完整 edition 绑定和范围不可用元信息；当前 Candidate 的 Playbook 语义召回、模型输入隔离和版本边界已由 VM 固定合成 provider 实证，root chmod 故障注入限制保留在验证证据中。 |

既有验证只证明文章/Memo 搜索与浏览器 Playbook 边界；本 Candidate 新增的 adapter、导航、服务端筛选和固定合成 provider 证据已通过，root 来宾无法触发 chmod I/O 故障注入，真实生产 provider 与发行镜像仍不在本次证据范围内。同步管理缺口由 [Playbook 实现状态](../style-playbook-integration/IMPLEMENTATION.md) 记录。

## References

- [长期契约](./SPEC.md)
- [兼容关系](./HISTORY.md)
- [验证证据](./VALIDATION.md)
- [独立 AI 搜索与关键词回退](../../adr/0020-keyword-first-hybrid-search.md)
- [关键词默认与混合结果统一排序](../../adr/0022-keyword-default-unified-ranking.md)
- [搜索引擎升级保留既有查询兼容性](../../adr/0023-search-legacy-compatibility.md)
- [统一搜索接口与范围](./contracts/unified-search.md)
- [统一搜索排序与独立 Playbook 同步管理](../../adr/0024-unified-search-and-playbook-sync-management.md)
