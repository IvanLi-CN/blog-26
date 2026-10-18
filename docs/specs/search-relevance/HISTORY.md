# 三种搜索模式的兼容关系

## Lifecycle / Compatibility

本主题定义关闭、RAG 和查询改写三种可手动选择的模式，默认关闭智能搜索并执行关键词全文检索，显式选择优先。两种 AI 各自执行，不互相接管失败；任一不可用时按原始查询回退关键词，三者均返回站内内容列表，不生成问答。AI 补充与关键词命中统一排序，同时保全合法关键词命中。

既有 search-full-text-fallback 提供受控 AST、权限及旧 SQLite 索引的兼容基线。本主题接替 enhanced 中仅有向量候选及重排失败保留语义基础结果的行为，并定义原始关键词保全、准确名称边界和模式状态。公开 HTTP 保留数组响应，新增模式元信息独立于已有结果结构。旧 enhanced 的 `rerankerModel` 与 `rerank=false` 语义继续兼容；新 RAG 管理策略不改变旧参数合同。

确定名称别名在三种模式及回退时都可用，多义简称由 RAG 的候选上下文判断处理；无 RAG 查询改写没有候选上下文，不通过无条件改写绕过歧义限制。既有中文片段、技术名称及关键词保全要求继续生效，不因组件默认 tokenizer 而收窄。

组件采用内嵌 Tantivy，经受控原生绑定接入 Bun。组件探针与产品集成证据分别记录；产品运行时已覆盖受控查询、当前权限、事务恢复、三种模式、管理员策略和公开内容集成本。发行与交付状态见实现覆盖。选型不改变文件内容来源、SQLite 运行投影、公开权限及管理员边界，不新增独立服务部署。

新搜索入口遇到 NEAR 位置语法时委托既有 SQLite FTS5 执行器，保持其计量和距离语义；不把 NEAR 静默重解释为普通关键词。旧内容列表与独立 semantic 继续由 search-full-text-fallback 拥有，不能为新引擎删除共享解析器能力。它们不变为新的页面模式。style-playbook-integration 继续拥有 Playbook 的公开 edition、内容与命中位置聚合，不纳入文章与 Memo 的 AI 执行链；共同排名和现代搜索入口由本主题拥有。

## 跨来源搜索边界

浏览器曾独立检索 Playbook，再与文章/Memo 结果拼接；单一展示列表不等于共同排名，现代 HTTP、tRPC 与 MCP 也没有相同的 Playbook 覆盖。需求确认选择全部时必须按相关性综合排序，来源或类型筛选必须先于截断。因此原有来源独立排名与显示上限不再是长期契约；同一服务端边界负责共同排名和全局容量，旧 semantic 与 enhanced 历史参数保持兼容。该决定见 [ADR 0024](../../adr/0024-unified-search-and-playbook-sync-management.md)，实现缺口见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## Related Changes

需求与设计提交为 `e6887ca09ab1ba0069314e0820f7f24650a3e23b`。运行时改造在 `th/search-modes` 中交付，保留三个子代理的独立原生探针与产品验证程序；当前尚无发布到生产或合并的事实。直接 PR 及最终审查引用在交付门禁完成后记录于本节。

## Provider Configuration and Quality Diagnostics

AI 搜索运行时继续复用既有 `llm_settings` 中的 chat、embedding、Base URL 和 API Key。`search_settings` 只保存搜索策略、预算和可选模型覆盖；缺少、失败或过期的质量记录通过 `qualityStatus` 展示为诊断状态，不再阻断完整提供方配置的 RAG 或改写执行。模式停用、提供方未配置、实际调用失败和 embedding 索引身份不匹配仍保留原有关键词回退或保护行为。

模型请求的 token 预算由提供方返回的 usage 校验；序列化请求使用独立字节上限保护传输，避免把多字节 UTF-8 内容误判为超出 token 预算并错误回退关键词。

## SSE Wait Boundary

公共 JSON 搜索保留既有数组与预算，RAG/改写的正式页面请求新增 `/api/public/search/stream`。流式入口先发送开始事件和阶段/心跳，再发送完整结果；embedding 与模型判断使用有界 30 秒等待并接收客户端取消。该传输变化不改变候选、权限、edition、排序或关键词回退，也不改变 tRPC、MCP 和 legacy semantic/enhanced 的既有合同。

Web Demo 与生产流保持相同的 AI-only 入口和 `started`、`progress`、`result` 事件顺序；慢 Mock 会响应 AbortSignal，Demo 夹具在 reader.cancel 或请求 AbortSignal 后清理排队事件，前端只接受带 `result` 事件的完整 EOF，测试同时证明 JSON 在短预算下回退、流式入口继续完成 AI 请求。

## 索引覆盖与管理统计的兼容范围

真实语义覆盖补充定义当前合格内容及预期分块的双口径，保持 RAG、查询改写、关键词、权限、同版绑定和排名合同。旧博客向量存储及 legacy semantic/enhanced 继续兼容，其物理行数与旧模型数据不再作为当前现代 RAG 已索引总量。新增覆盖要求修正统计与准备路径的既有遗漏，不授权生产补建、旧数据清理、应用发布或部署。

管理页以唯一内容对象作为 RAG 主卡的计数和覆盖率单位，语义分块的数量、状态与覆盖率位于详情。此选择保留每个可独立阅读内容的身份，避免多章节或多资源对象放大摘要数量；部分覆盖通过内容状态及分块详情共同解释。

## References

- [长期契约](./SPEC.md)
- [实现方案与覆盖](./IMPLEMENTATION.md)
- [独立 AI 搜索与关键词回退](../../adr/0020-keyword-first-hybrid-search.md)
- [关键词默认与混合结果统一排序](../../adr/0022-keyword-default-unified-ranking.md)
- [内嵌 Tantivy 与 NEAR 兼容范围](../../adr/0021-embedded-tantivy-search.md)
- [搜索引擎升级保留既有查询兼容性](../../adr/0023-search-legacy-compatibility.md)
- [组件验证证据](./VALIDATION.md)

## 内容同步数量与 RAG 覆盖缺陷修复

主人确认按唯一公开父内容统计 RAG 主卡、按预期分块统计详情，来源收录包含当前 local 与公开 Playbook；持久来源任务保留历史与恢复边界。主人随后禁止真实 embedding 实证，明确改用 Mock 或不执行，本次验收因此以隔离 Mock 链路和确定性故障注入为准，不再要求真实提供方配置或凭据。来源下拉选择器改为“全部 / 博客 / Playbook”单选 chip；移动证据改为 393×852 的真实移动模拟单屏，主人确认展示正常并授权继续到 PR 合并。

语义准备增加跨进程执行围栏与恢复扫描，防止旧执行者污染当前目标；持久取消检查保护 Playbook 采用点。全局排名、公开准入、legacy semantic/enhanced 和 rewrite 兼容边界保持原契约。

补齐显式查询回退路径的 RAG 覆盖元信息，使 NEAR 和字段表达式与普通 RAG 查询遵循同一所选范围覆盖契约。
