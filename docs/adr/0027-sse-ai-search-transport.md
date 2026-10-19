# AI 搜索的 SSE 传输与长预算边界

## Context

公共 RAG 和查询改写原先通过单次 JSON 请求同步等待 embedding、候选判断或改写模型。线上请求在模型返回前没有任何响应字节，边缘代理可能按空闲连接处理；同时默认模型预算为 10 秒，达到预算后服务端只能降级为关键词。只增加心跳而保留 10 秒模型中止，不能恢复 AI 结果；只延长 JSON 请求又不能保证代理看到进度。

## Decision

- 保留 `/api/public/search` 的 JSON 数组合同，供兼容调用者继续使用原有预算和响应头。
- 为 `rag` 与 `rewrite` 增加 GET `/api/public/search/stream`。服务端立即发送 `started`，随后发送阶段 `progress` 事件，每 2 秒发送 SSE 注释心跳；关键词首批结果和最终 AI 结果的增量语义由 [ADR 0028](./0028-progressive-keyword-first-search-results.md) 定义。
- 流式执行把 embedding 和模型判断的单次最长等待提升到有界的 60 秒上限，并把客户端取消信号传入所有模型请求；请求断开后不再发送结果，也不继续占用搜索工作。
- 正式搜索页只将 AI 模式切换到该流，关键词仍使用快速 JSON；Web Demo 对同一 URL 提供确定性 SSE fixture。tRPC、MCP、legacy semantic/enhanced 不改传输或响应形状。
- SSE 只改善连接存活和等待预算，不改变候选范围、排序、权限、版本身份或关键词回退。模型实际失败仍返回关键词结果并携带原有执行原因。

## Consequences

边缘代理在模型处理期间能够收到首字节和心跳，60 秒内完成的慢 provider 不会因固定 10 秒同步预算提前降级。长请求仍有明确上限，模型 provider 过慢或不可用时仍会受控回退。客户端需要解析增量事件流并在 URL 变化时取消旧请求；旧 API 消费者无需迁移。

## Rejected alternatives

- 只把 JSON 响应头改成 `text/event-stream`：不会改变模型中止点，也无法传输最终 envelope。
- 无限延长模型请求或后台无界任务：会放大资源占用并失去取消与故障边界。
- 修改 provider 的原生流式 JSON 协议：当前兼容 provider 不保证支持，且与站内结果列表语义无关。
