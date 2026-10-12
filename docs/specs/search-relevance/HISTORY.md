# 三种搜索模式的兼容关系

## Lifecycle / Compatibility

本主题定义关闭、RAG 和查询改写三种可手动选择的模式，默认关闭智能搜索并执行关键词全文检索，显式选择优先。两种 AI 各自执行，不互相接管失败；任一不可用时按原始查询回退关键词，三者均返回站内内容列表，不生成问答。AI 补充与关键词命中统一排序，同时保全合法关键词命中。

既有 search-full-text-fallback 提供受控 AST、权限及旧 SQLite 索引的兼容基线。本主题接替 enhanced 中仅有向量候选及重排失败保留语义基础结果的行为，并定义原始关键词保全、准确名称边界和模式状态。公开 HTTP 保留数组响应，新增模式元信息独立于已有结果结构。旧 enhanced 的 `rerankerModel` 与 `rerank=false` 语义继续兼容；新 RAG 管理策略不改变旧参数合同。

确定名称别名在三种模式及回退时都可用，多义简称由 RAG 的候选上下文判断处理；无 RAG 查询改写没有候选上下文，不通过无条件改写绕过歧义限制。既有中文片段、技术名称及关键词保全要求继续生效，不因组件默认 tokenizer 而收窄。

组件采用内嵌 Tantivy，经受控原生绑定接入 Bun。组件探针与产品集成证据分别记录；产品运行时已覆盖受控查询、当前权限、事务恢复、三种模式、管理员策略和公开内容集成本。发行与交付状态见实现覆盖。选型不改变文件内容来源、SQLite 运行投影、公开权限及管理员边界，不新增独立服务部署。

新搜索入口遇到 NEAR 位置语法时委托既有 SQLite FTS5 执行器，保持其计量和距离语义；不把 NEAR 静默重解释为普通关键词。旧内容列表与独立 semantic 继续由 search-full-text-fallback 拥有，不能为新引擎删除共享解析器能力。它们不变为新的页面模式。style-playbook-integration 继续拥有 Playbook 的公开 edition、来源顺序与章节聚合，不纳入文章与 Memo 的 AI 执行链。

## Related Changes

需求与设计提交为 `e6887ca09ab1ba0069314e0820f7f24650a3e23b`。运行时改造在 `th/search-modes` 中交付，保留三个子代理的独立原生探针与产品验证程序；当前尚无发布到生产或合并的事实。直接 PR 及最终审查引用在交付门禁完成后记录于本节。

## References

- [长期契约](./SPEC.md)
- [实现方案与覆盖](./IMPLEMENTATION.md)
- [独立 AI 搜索与关键词回退](../../adr/0020-keyword-first-hybrid-search.md)
- [关键词默认与混合结果统一排序](../../adr/0022-keyword-default-unified-ranking.md)
- [内嵌 Tantivy 与 NEAR 兼容范围](../../adr/0021-embedded-tantivy-search.md)
- [搜索引擎升级保留既有查询兼容性](../../adr/0023-search-legacy-compatibility.md)
- [组件验证证据](./VALIDATION.md)
