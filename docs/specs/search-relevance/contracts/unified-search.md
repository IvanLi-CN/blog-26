# 统一搜索接口与范围

本契约由 `REQ-SREL-006`、`REQ-SREL-019` 至 `REQ-SREL-021` 拥有。现代入口共享查询解释、范围、权限、内容聚合、综合排名和请求开始时固定的当前 Playbook 快照；不同传输方式不产生独立检索语义。

## 入口与既有兼容边界

| 入口 | 成功结构 | 默认 / 最大 topK | 说明 |
| --- | --- | --- | --- |
| `/api/public/search` | 结果 JSON 数组 | 20 / 100 | 仅公开内容；模式和范围元信息放响应头 |
| tRPC `search.content` | `{ results, requestedMode, effectiveMode, reason? }` 及可选范围元信息 | 20 / 100 | 仅公开内容 |
| MCP `search_content` | 同等 envelope | 20 / 50 | `publishedOnly=false` 仍要求管理员；Playbook 仍只消费公开包 |
| 公开网页 / console 搜索页 | 消费现代 HTTP 结果 | 请求 50 | 发起范围检索并保持服务端排名，不补取独立来源排名 |

旧的 `search.ai.semantic` / MCP `search_semantic` 仍是显式底层语义入口，不自动承诺已发布 Playbook 的全文覆盖。旧 enhanced 数组与 `rerank=false`、`rerankerModel` 的历史执行意义保持兼容；默认接入现代 RAG 编排的 enhanced 分支复用统一关键词范围，不借兼容入口放宽扫描、权限或既有上限。

## 输入

| 字段 | 语义 |
| --- | --- |
| `q` | 原始查询；空白返回空数组，不调用 AI。继承受控查询预算和语法 |
| `mode` | `keyword`（默认）、`rag`、`rewrite` |
| `topK` | 当前范围中返回的唯一内容全局上限；继承各入口上限，不按来源另分名额 |
| `source` | 可选 `all`（默认）、`blog`、`playbook`；表达内容归属 |
| `type` | `all`（默认）、`post`、`memo`、`clipping`、`topic`、`experience`、`policy`；保留既有 `memo` 含普通 Memo 与剪藏的语义 |
| `edition`、`sourceReleaseId`、`sourceTag` | 旧调用者可携带的遗留字段；接收后完全忽略，不参与校验、版本选择、缓存身份或检索 |
| MCP `publishedOnly` | 默认 true；原有管理员授权要求保持有效 |

搜索没有版本选择器；请求开始时固定控制台当前采用版本，网页也不再传自己的版本身份。响应可返回实际使用快照的 provenance。来源/类型交叉不匹配时返回空集合，例如 `source=playbook&type=post`；不得静默改成全部。

过滤先于容量选择，切换类型或来源必须对相应完整合格语料执行检索。UI 数字表示已返回的唯一内容数，不能把全部前 50 条中的某类零命中解释为整个语料不存在此类内容，也不能据此禁用分类。范围与模式保存在可分享 URL，并遵守既有迟到响应与历史导航契约。

Playbook 普通查询、短语、字段、布尔组合、前缀和名称边界继承共同查询解释，不能使用一个忽略操作符、隐式模糊或任意前缀的旁路查询补充结果。字段映射到实际公开阅读内容：`title` 为内容/命中位置名称，`excerpt` 为公开简介，`body` 为实际正文与公开资源，`tags` 为公开分类/关键词，`slug` 为规范内容 slug。缺少字段按空值处理，不虚构文章字段；`NEAR(...)` 的既有距离语义仍通过受控兼容执行器保持，不静默漏掉 Playbook 或重解释为普通词。

## 结果身份与位置

文章/Memo 保留 `slug`、`title`、`excerpt`、`snippet`、`type`、剪藏标识和真实高亮等既有字段。Playbook 的 `type` 分别为 `topic`、`experience` 或 `policy`，`source` 为 `playbook`，`href` 必须为有效 `/playbook/` 目标；文章/Memo 可继续省略 `source`，缺省含义为 blog。不得把 Playbook 伪装成文章或 Memo。

内容身份由来源、类型与规范阅读路由组成，目标中的章节或文件位置不改变身份。章节命中沿用 `sections` 的标题、片段、顺序和链接；公开资源命中使用同一附属位置集合，并增加可选的 `kind=resource` 与安全的 `resourcePath`，旧章节对象结构保持兼容。文件以所属 Policy 的规范路径定位，链接只能选择该绑定快照中的公开文件。主结果使用同版权威标题和最佳有效命中；位置集合按规范位置去重，最多默认展示三个，其余在同一主结果中展开。

综合排名在服务端完成，客户端只能按同一服务提供的顺序渲染，不能比较内部 `final`、章节分数或模型判断值重新排序。原始关键词集合在共同 `topK` 内受保护，文章/Memo 与同版 Playbook 的有效 RAG 补充使用余下容量；rewrite 只为博客补充查询，Playbook 原始命中保留且不进入改写模型。Playbook 候选正文和资源作为不可信证据传入模型，模型只能返回已提供的候选 ID、相关性、排名和证据。语义投影缺失时保留同版词法候选并报告覆盖不足，来源筛选为仅 Playbook 时仍保留调用者所选模式。

## 版本与可用性元信息

现代 envelope 可增加 `playbook: { edition, sourceReleaseId, sourceTag }`、`incompleteSources` 和 `ragIncompleteSources`；HTTP 以 `Search-Playbook-Edition`、`Search-Playbook-Source-Release-Id`、`Search-Playbook-Source-Tag`、`Search-Incomplete-Sources` 与 `Search-RAG-Incomplete-Sources` 表达同等事实，并按既有跨域响应策略使调用客户端可读取。HTTP 继续使用 `Search-Requested-Mode`、`Search-Effective-Mode`、`Search-Reason` 表达模式，不用模式回退字段替代来源不可用。只有实际参与检索的快照才能报告为已使用版本。

遗留版本字段无论值是否完整、未知或畸形都不能触发搜索版本冲突；除这三个字段外的未知输入由入口拒绝。仅 Playbook 且没有可查询快照时返回受控不可用，JSON 与 SSE 分别以响应状态或 error event 保留同一受控 code/message。全部范围在没有 Playbook 时可返回博客结果，同时明确 `incompleteSources=["playbook"]`；用户可以区分结果不完整与完全检索后的正常零命中。缓存仍可查询但最近同步失败时，继续报告实际使用的旧版，不能将其误报为搜索故障。

版本、任务和错误详情在管理员视图与程序化元信息中可核对；公开页面只提供有行动意义的不可用/刷新提示，不增加自动生成的版本、digest 或内部引擎文案。响应不得暴露凭据、私有源路径或未经授权内容。

覆盖元信息依据所选来源、类型、公开准入及完整 edition 的预期目标计算，独立于本次向量命中、关键词数量与 topK。生成、统计和现代向量消费共用输入、分块、配置指纹及维度绑定判定；未经验证的旧向量不得被视为当前有效投影。管理员内容/分块双单位接口见 [内容同步状态契约](../../style-playbook-integration/contracts/content-sync-status.md)。
