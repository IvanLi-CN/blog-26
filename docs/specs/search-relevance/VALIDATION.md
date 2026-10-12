# 搜索实现验证证据

本报告区分产品集成与独立组件探针，覆盖范围见 [实现](./IMPLEMENTATION.md)。以下产品结果与后文组件探针分别保留，不将探针能力当作运行时验收。

## 候选级模型请求证据

DeepSeek 的结构化搜索请求关闭 thinking 后，RAG 与改写各通过 4/4 固定质量样例及 5/5 实际搜索。输出、指纹和断言边界见 [非思考模式证据](./validation/product/empirical-search-model-nonthinking.txt)。此记录证明该次模型质量验证；后续候选的合并门禁仍须绑定实际 PR 头。

原始搜索实现通过 PR #214 合入主线。该 PR 的 CI、Web Demo 和视觉结果是原始功能候选的历史证据，不代表后续兼容修复的当前头状态，也不能替代后续候选自己的 CI、审查或模型验证。本 Spec 不据此宣称搜索实现已部署生产。

## 改写概念发现修复

候选 `5f3a4462590580fdc369c412aaa216f57177f770` 的 RAG 质量 4/4、实际搜索 5/5 通过；改写质量 4/4 通过，但实际“嵌入式 SQL 数据库”输出原查询、嵌入式数据库和 SQLite，仅返回关键词内容，遗漏 SQLite3 专题，严格概念发现断言失败。提示词、模型和样例相对先前通过候选没有变化，不能将失败归因于 writer 修复。[原始失败证据](./validation/product/empirical-rewrite-discovery-failure.txt) 保留。

诊断确认旧质量检查的正则接受原查询中的“嵌入”，没有证明专题能被找到。主人授权修复后，改写提示词明确使用独立表达查询相关版本，质量验证改为隔离的固定合成 Tantivy 检索，保持实际验收原断言、预算及无重试策略。28 个模式集成测试通过，包括 SQLite-only 扩展拒绝、泛化 JavaScript 扩展拒绝、正负内容实际检索、仅查询进入模型及配置变化后的过期授予拒绝；完整提交检查 1058 pass / 0 fail，135 个文件。

修复候选 `fc499538ffbe05b085fec0475af67830fda15d9c` 的 RAG 和改写各通过 4/4 质量样例、5/5 实际搜索，仍使用上述实际提供方及两种模式各 30 秒、4096 输出 token。概念查询实际输出原查询、SQLite、SQLite3，结果包含 SQLite3 专题；无关输入返回空列表，Node.js 不召回图节点，中文短词和关键词保全断言保持不变。RAG 指纹仍为 `220b0bcb7223f0769e73a55f163eae497bf12117c4e44df32c66fbff47a9a8de`，改写指纹为 `b085e8e6a6c99a0612b72e5183b7cf62b100fa00da2a432752747cdbbc37a95f`，证明改写测试集改变没有撤销另一模式的有效依据。[实际模型输出和检索日志](./validation/product/empirical-rewrite-retrieval-fixed.txt) 只含固定合成样例，没有正文反馈或自动重试。

## 排序修复后的产品验证

RAG 同分处理不再比较 BM25 与余弦分数，改用内容发布时间和身份稳定排序；固定质量检查要求专题严格优于顺带提及，同分不能授予通过。RAG 提示词明确专题优先于参考清单，检索策略和测试集版本随之更新，使旧质量依据失效。这些修复维持已接受的排序要求，不降低原断言；未保留的旧模型判断不能被推定为本次修复的已证实触发原因。

- 相关原生集成与排名测试：27 pass / 0 fail，包含跨检索来源同分和质量同分拒绝。
- deepseek-v4-flash + BAAI/bge-m3 的实际验收：RAG、rewrite 各 4/4 固定质量样例及各 5 类实际查询通过；SQLite3 专题优于顺带提及、关键词保全、Node 运行时与无关节点区分、中文短词、无关输入拒绝及概念发现均保持原断言。全部请求只包含固定合成内容，见 [完整模型输出与请求元信息](./validation/product/empirical-ranking-fixed.txt)。
- 验证策略两种模式均显式配置 30 秒、输出 4096 token；RAG 指纹 `220b0bcb7223f0769e73a55f163eae497bf12117c4e44df32c66fbff47a9a8de`，rewrite 指纹 `3328d224a38d03eb7295c3872d625476eb41544ed4df7b4e5f56f878f5b1a720`。产品默认 10/5 秒和输出 2048/1024 不变，证据不能证明该提供方默认预算稳定可用。一次 RAG 样例共消耗 3476 个 completion token，其中 3397 为 reasoning token，证明该模型的输出预算包含推理成本。
- 当前主线同步后的正式 Web Demo：5/5 页面 E2E、54/54 Storybook play；浏览器缺少默认缓存路径造成的启动失败已通过显式复用现有来宾浏览器目录解决，未修改测试断言。
- technical-v2 原生索引使用同一完整 296 条公开 corpus：索引 498523 字节，构建 310.79ms，200 次热查询 P50 0.238ms、P95 1.430ms，采样峰值 RSS 89100288 字节，定时器推进 65 次。见 [当前分析器性能汇总](./validation/product/corpus-benchmark-v2.json)；公开内容不进入模型，仍不是端到端 SLA。

复现实际模型验收使用 `bun scripts/verify-search-empirical.ts --rag-timeout-ms 30000 --rag-output-tokens 4096 --rewrite-timeout-ms 30000 --rewrite-output-tokens 4096 --capture-judgments`。诊断输出仅为固定合成样例的最终 JSON、结束原因及 token 用量，不记录凭据或模型思考全文。发行镜像、视觉确认与正式只读审查仍是剩余交付门禁。

## 生产打包边界

候选 `935108575b1d11cf99870b90409dce0d5e415819` 的源码构建镜像通过非 root 原生加载与完整契约探针，冻结发行路径通过静态产物校验、OCI 导出和生产启动烟测；但实际 HTTP 关键词查询返回 `503 search-engine-unavailable`，因此上述启动烟测不能证明搜索可用。[实际失败日志](./validation/product/image-http-regression.txt) 保留这一边界。

Console 的启动入口直接导入 TypeScript 搜索模块，而 Astro SSR 又打包了同一模块；模块级投影缓存因此产生两份，准备完成后的 writer 与请求侧 writer 争用同一个索引。修复将投影缓存及串行队列按规范化数据库和索引路径存放于进程共享槽；受控错误使用同一进程符号标识，在两个 bundle 的异常处理之间保留类别。新增真实 Bun 打包测试分别先复现不同投影实例和错误类别不可识别，修复后 30 个相关原生、权限及恢复测试通过。该修复不以重新运行初始化、请求重建索引或跳过 writer 锁解决故障。

完整发行验证除原有 health、版本和页面烟测外，还必须在实际镜像内执行原生匹配探针，并通过 HTTP 断言关键词命中、私有内容排除和未配置 AI 的原始关键词回退；这些查询检查不能被单独启动成功替代。最终候选及实际产物身份由当前验收卡和发行 manifest 绑定，旧候选的通过或失败记录不冒充新候选。

writer 修复候选 `5f3a4462590580fdc369c412aaa216f57177f770` 的源码构建镜像与冻结预构建 OCI 均通过非 root 原生契约矩阵、生产版本身份及 HTTP 关键词、私有内容排除、未配置 AI 回退检查。冻结 manifest identity 为 `7a3b508b6bd7e713e13ce65bd90ee4878939ba652398a8244bb5c7463dd95da7`，image digest 为 `sha256:8dcdf10ffb1f7cd4194d8f448a983a54f60e686d10b00300e4fb4599062481d7`。该结果证明 writer 打包修复有效，不替代随后改写修复候选的发行身份。

## 修复前诊断记录

候选 `da18347e4a63d80bc8c76be3aa8584b665328707` 已同步到 `f383c2ba2c81cc330670fea44eff17442f02bc9e`，正文保留原拼写，仅查询端 NFKC 与 ASCII 大小写等价生效。完整 pre-commit 为 1050 pass / 0 fail、135 个文件；26 个相关迁移、权限、恢复和名称测试及原生契约程序通过。

修复前真实模型验收状态为 failed：RAG 与 rewrite 的各 4 个固定质量样例通过，但实际 RAG `SQLite` 请求在 10 秒预算下发生 TimeoutError，正确以原查询回退到关键词，未满足两条 AI 链实际执行通过的验收。新旧候选对比没有改变模型、提示词或超时配置；正文正规化及名称策略指纹发生变化。不能仅凭一次超时认定提供方抖动或代码回归，不能用历史通过覆盖当前失败。原始证据见 [失败日志](./validation/product/empirical-regression.txt)。该次失败保留为历史诊断，不以随后配置运行覆盖。

主人明确授权将本提供方 RAG 验证预算设为 30 秒后，使用相同合成样例重新运行。两种模式各 4 个质量样例通过，实际 RAG `SQLite` 请求在 9.599 秒内成功执行并返回 `keyword`、`sqlite3`，但顺带提及排在专题内容前，未通过原有排序断言。程序在首条实际查询处停止，不能声称后续实际查询通过。相关排序代码、提示词与先前通过候选的 Git 对比没有变化；当前日志未记录模型判断，尚不能区分模型排名与结果合并的原因。保留 [30 秒配置失败日志](./validation/product/empirical-authorized-30s-failure.txt)。本次配置 RAG 指纹为 `d56f52dcd8898e260a8872869edd0d62342761a02b16ce242ca8541d4446d77d`，rewrite 指纹为 `431643520ff288445614224cc6ce193a56bc81667a5dd56038499ded82c4c389`。这些失败证据保留，不替代下文修复后的验收。

代码核验还发现两个确定的缺口：RAG 模型同分时，结果合并直接比较关键词 BM25 与向量余弦分数，二者量纲不可比较；固定质量样例的优先顺序检查按模型 rank 稳定排序，专题先输入时同分也会通过，不能证明严格优先。模型原始判断未保留，因此这两个缺口是否触发了本次实际失败仍待证据。

源代码构建的 linux/amd64 镜像内非 root 原生加载、磁盘增删改与异步查询矩阵通过；该次构建缺少完整版本元信息，因此生产服务启动未通过，不能当作实际发行运行证明。后续仍需完整冻结元信息的预构建发行路径验证。Web Demo 已在显式 renderer commit 下重新构建成功；此前页面/组件证据尚未重新核验，不代表当前候选交付通过。

## 先前候选的产品集成结果

| 验证 | 实际结果 |
| --- | --- |
| 全量仓库测试 | Agent VM、非 root 用户、显式 30 秒单测超时预算；1041 pass / 0 fail，131 个文件，4709 次断言。 |
| 原生契约 | 锁定 Rust 1.91/Tantivy 0.26.2，真实 Bun 加载，名称/中文/字段/布尔/前缀矩阵，异步打开与并发查询定时器，更新/删除、稳定同分与前缀预算拒绝通过。 |
| 持久恢复与权限 | 真实 SQLite/Tantivy 集成，事务回滚、SIGKILL、索引提交后 checkpoint 前退出、重放、I/O 失败、generation 切换及剪藏文件撤回通过；HTTP/tRPC/MCP 与管理员接口覆盖由仓库测试执行。 |
| 真实模型 | deepseek-v4-flash + BAAI/bge-m3，经已配置提供方实际调用；RAG 与 rewrite 各通过 4 个固定质量样例及 5 类实际搜索。只有合成内容进入模型，详见 [原始日志](./validation/product/empirical.txt)。 |
| 模型预算边界 | RAG 使用默认 10 秒、输出 2048；rewrite 显式使用 30 秒、输出 4096。该结果支持这组指纹配置，不能声称默认 5 秒在该提供方可靠。默认预算未改，超时仍直接回退关键词。 |
| 页面交互 | 正式 Web Demo 路由 5/5 E2E：切换、刷新、历史、实际回退/索引错误、迟到请求、393×852 键盘交互，以及管理员保存和异步验证。桌面滑块几何检查通过。 |
| Storybook | 全部 51 个现有及新增 play 场景通过，包括真实命中高亮、无百分比、来源回归、新模式控件与独立策略编辑。 |
| 格式检查 | bun run check 通过，769 个文件；保留既有 26 个 warning 和 1 个 info。 |
| 发行与视觉 | Docker 两种真实发行路径及视觉确认仍在进行，不据上述结果宣告交付就绪。 |

### 公开内容集性能

从公开 snapshot 端点完整读取 20 篇文章和 276 条 Memo，共 296 条公开内容；不包含私有内容，不向模型发送。快照生成于 2026-10-09T09:34:50.947Z，SHA-256 为 `bd707f35c4d1983fb1220f36dca7227f3f7c08e1753bd8d25acdb071d9bde336`。所有文章/Memo 正文及五个索引字段进入生产 NativeIndex，索引输入 JSON 为 474,907 字节；当前快照无剪藏文章。

索引 509,694 字节，异步打开和首次提交合计 211.44ms。8 个固定查询每个预热 3 次、计时 25 次，共 200 次热查询：P50 0.241ms、P95 0.813ms；RSS 从 53,215,232 字节开始，采样峰值 89,116,672 字节，结束 72,400,896 字节，5ms 定时器推进 56 次。测量在本会话 8 vCPU Linux VM 中进行，其他构建可能共用 CPU；这是引擎级热查询成本，未清空 OS 缓存，不是服务总延迟或任意规模 SLA。完整汇总见 [性能结果](./validation/product/corpus-benchmark.json)。

### 复现产品验证

原生执行 `bun run search:native:build && bun run search:native:verify`，持久/权限测试为 `bun test src/server/services/content-search.test.ts src/server/services/search-index-recovery.test.ts src/server/services/search-ranking.test.ts`。全量测试使用仓库原有发现规则，环境显式允许 30 秒预算，并在非 root Linux 用户下运行故障注入。

真实模型执行 `bun scripts/verify-search-empirical.ts --rewrite-timeout-ms 30000 --rewrite-output-tokens 4096`；凭据由现有配置提供，不放入日志或参数。该程序新建临时 DB 和索引，先通过各模式质量验证，再断言实际执行模式、关键词保全、概念发现及负例排除；实际成功不能由 mock 替代。

页面用 `bun run web-demo:build` 和 `bun run web-demo:preview`，测试 `tests/e2e/web-demo/search-modes.spec.ts`；组件用 `bun run build-storybook` 和 `bun tests/storybook/playbook-interactions.ts`。Demo 是独立构建资产，模型管理测试是内存模拟，不发送真实凭据。

## 独立组件探针

以下记录对应内嵌引擎选型时的独立验证，不替代上文产品结果。三个子代理在同一会话的 Linux VM 中分别完成 Bun 接入、匹配语法、同步恢复验证。原生接入和合成数据同步恢复可行，内置配置存在满足本批文字规则的方案；据此采用 Tantivy。旧 NEAR 不由 Tantivy 原生 parser 兼容的证据保留；产品适配层把该语法委托给 SQLite FTS5，因此不要求 Tantivy 直接实现位置查询。完整支持语法及产品集成仍须按当前候选验证，不能称为可直接替换的生产实现。

## 实际结果

| 验证项 | 结果 | 证据边界 |
| --- | --- | --- |
| 锁定版本与 Linux 构建 | 通过 | Tantivy 0.26.2、napi 3.14.2、napi-derive 3.6.12、napi-build 2.6.0；Rust/Cargo 1.91.0，Debian 13.7 x86_64。保存 [Cargo.lock](./validation/tantivy/Cargo.lock) 和 [成功构建日志](./validation/tantivy/build-retry.txt)。 |
| Bun 原生桥接 | 通过，本批案例 | Bun 1.4.2 实际加载磁盘索引，增量提交、替换、Unicode、受控错误、异步事件循环和关闭重开均通过，详见 [桥接报告](./validation/tantivy/bun-bridge/bridge-report.md)。 |
| 名称、中文片段及基本逻辑 | 存在通过的内置配置 | 六个分析器分别执行 24 条断言；内置 RegexTokenizer 保留 ASCII 名称及其余字符位置的配置通过 24/24，其余配置保留真实失败。包含 Arch 边界、C/C++/C#、版本后缀、Node.js/Node js、中文非连续负例、字段和独立布尔正负例。详见 [匹配报告](./validation/tantivy/matching/matching-report.md)。 |
| 显式词首匹配 | 内置 query 能实现，原生语法不兼容 | 显式 RegexQuery `arch.*` 在该配置命中正确集合；直接转发 `arch*` 或引号前缀不能保留产品语义。尚未实现通用受控 AST 编译器。 |
| SQLite NEAR 兼容 | 未通过，新模式不要求兼容 | 原生 parser 不支持既有 NEAR；PhraseQuery slop、默认词位置及 NgramTokenizer 的 position=0 均不能直接保持既有距离与无序语义。旧列表和独立 semantic 留在 SQLite，新入口应明确拒绝该语法。 |
| SQLite outbox 与 Tantivy 恢复 | 通过，合成探针 | 14 条断言覆盖事务回滚、增删改、reader reload、writer 锁、幂等重放、clear/rebuild、提交前及提交后检查点前的真实子进程退出，详见 [恢复报告](./validation/tantivy/sync/persistence-report.md)。 |
| 发布镜像、真实权限与性能 | 未验证 | 裸 Linux 开发产物不等于实际 Docker 发行物；真实剪藏文件权限、完整 corpus、commit I/O 失败、断电及生产多实例未测。Darwin 原生开发构建未测。 |

桥接异步探针执行 20,000 次真实查询时耗时约 6.4 秒，Bun 定时器推进 4,680 次；这证明该工作负载没有阻塞事件循环，不是站内查询性能 SLA。首次 require 约 3.17ms，未清空 OS 缓存，不能称为机器冷启动。原生库实际依赖 libc、libm、libgcc_s 和动态加载器，最高版本需求为 GLIBC_2.34；发布容器仍需独立加载验证。

默认分析器把 arch_linux 当作 Arch、混同 C/C++/C#，并遗漏中英交界。只保留汉字的 Regex 配置会把“文。章”“文 章”“文-章”当作“文章”；Ngram 配置还展示了先取 top 3 再过滤会遗漏合法结果。通过配置使用内置 RegexTokenizer `[A-Za-z0-9_+#]+|(?s:.)`，ASCII 名称保持完整，其余字符包括分隔符保留独立位置，不包含项目自写 tokenizer、倒排索引或全量正文后过滤。这是有限能力证明，不代表已验收 Unicode 边缘、别名、全部 AST、分页和索引成本。

## NEAR 对照

同一程序导入实际受控 parser，分别在 macOS Bun 1.4.2 / SQLite 3.51.0 和 Linux Bun 1.4.2 / SQLite 3.53.2 执行 28 条查询。除首行平台版本元信息外，查询分类、FTS 表达式和结果逐 JSON 完全一致；两份证据分别为 [macOS 对照](./validation/tantivy/matching/sqlite-near.txt) 与 [Linux 对照](./validation/tantivy/matching/sqlite-near-linux.txt)。不能仅凭 Bun 版本相同假定 SQLite 版本相同。

`NEAR(alpha beta, 0)` 至距离 2 均不命中相邻文字，距离 3 才同时命中正序与反序。`NEAR(甲乙丙 丁戊己, 2)` 命中连续及反序，插入句号需要距离 3，插入“中间”需要距离 4。默认 Tantivy PhraseQuery 的 slop 1 已可跨过一个很长的中间单词，slop 2 才包括反序。两者计量不同，不能直接复制整数。通过文字矩阵的 Regex 配置同样混合了 ASCII 名称与单字符位置，不自动解决这个问题。

## 执行与可复现范围

前两次 Agent VM acquire 均因来宾 agent 超时失败，未运行来宾命令。主人要求重试后，同一会话 generation 3 成功启动 Linux x86_64 来宾；工具链、编译和原生运行全部发生在该 VM，没有本机原生构建、生产模型调用或基础设施修复。

首次 workspace 构建发现探针中的 rusqlite 整数转换和 Tantivy TopDocs builder 用法错误，保留 [初次构建日志](./validation/tantivy/build.txt)。修复探针后锁定构建退出码为 0；匹配代理随后增加独立布尔与版本断言并单独重建自身 crate，完整运行结果已保存。查询语义失败没有通过修改期望、应用侧后过滤或隐藏错误转换为通过。

重现入口与所有原始输出见 [验证 workspace](./validation/tantivy/README.md)。保存源码、Cargo.lock 和文本日志，不将 Linux 原生二进制复制到项目产品目录。探针只使用临时合成数据，没有接入产品搜索运行时。

## 对设计的影响

采用 Tantivy 的依据包括实际 Bun 接入、有限匹配配置和恢复证据，选型理由与 NEAR 范围见 [ADR 0021](../../adr/0021-embedded-tantivy-search.md)。产品集成仍须独立完成支持的受控 AST：字段、布尔、短语、前缀、短查询、非法文字重试与预算适配，以及 NEAR 的明确拒绝路径。旧列表和独立 semantic 保留 SQLite NEAR，不实现 Tantivy 位置兼容；不能直接使用原生 QueryParser 替换产品 parser，也不能把旧距离换成词距后宣称兼容。

SQLite 事务 outbox、成功索引提交后 checkpoint、单 writer 和当前权限校验可以作为集成方向；探针只证明合成流程，未证明请求开始快照、真实文件权限或生产调用点已实现。还需验证实际发行镜像、完整 corpus 的延迟/内存/索引大小及上线重建。三种搜索模式的需求保持不变，当前验证没有让产品中的三种模式变为可用。
