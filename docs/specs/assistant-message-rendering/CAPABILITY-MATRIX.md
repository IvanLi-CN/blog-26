# 当前能力与缺口

本表复核基线为 `dfb74658203f5f454beb5c6b47dbd024e4dbbc64`。源码观察沿用并复核既有审查；可执行探针使用锁定依赖直接调用生产 `MarkdownRenderer`、`cleanMarkdownContent` 与标准解析器，静态 DOM 结果见下文。静态渲染不执行浏览器网络、剪贴板、布局或生成生命周期验收。用户提供的历史截图不能证明当前版本仍未接入解析器。

## 判定口径

- **源码缺陷**：从具体属性丢弃或改写逻辑可确定语义损失；仍需回归用例验证最终修复。
- **管线支持**：插件或默认元素具备处理路径，不等于聊天布局、交互或安全验收通过。
- **策略关闭**：依赖具有能力，但调用方明确关闭，不是库缺失。
- **待验证**：尚无专项执行证据，不能按“支持”或“故障”对外交付。

## 格式与内容

| 格式或内容 | 当前事实 | 缺口与建议 | 证据 |
| --- | --- | --- | --- |
| 发言者区分 | 用户和助手共用 Markdown 渲染 | 按已确认需求，用户改为字面文本，助手才解析 | [KnowledgeAssistant](../../../site/components/KnowledgeAssistant.tsx#L529) |
| 标题、段落、强调、分隔线 | 有解析和自定义元素路径；部分既有断言 | 适配聊天段距，避免把文章标题尺寸直接搬进气泡；尚未视觉复测 | [元素映射](../../../src/components/common/MarkdownRenderer.tsx#L294) |
| 无序、有序、嵌套列表 | 管线支持；`ol` 仅保留 children | **源码缺陷**：丢失 `start`，非 1 起始序号失真 | [列表映射](../../../src/components/common/MarkdownRenderer.tsx#L350) |
| 删除线、自动链接 | GFM 路径支持 | 增加消息正文专项断言 | [remark 配置](../../../src/components/common/MarkdownRenderer.tsx#L164) |
| 任务列表 | GFM 路径支持 | `ul/li` 丢失专用属性；核验 checkbox 只读和主题样式 | [列表映射](../../../src/components/common/MarkdownRenderer.tsx#L350) |
| Markdown 表格 | 已有响应式包装 | 单元格强制不换行；按确认需求允许普通文字换行，超宽局部滚动 | [表格插件](../../../src/components/common/markdown/plugins/rehype-responsive-tables.ts#L123) |
| 行内代码、带语言围栏 | 有代码组件和高亮路径 | 覆盖真实块级结构、特殊语言名和复制按钮 | [代码映射](../../../src/components/common/MarkdownRenderer.tsx#L226) |
| 无语言围栏、缩进代码 | 按是否匹配语言 class 推断块级 | **源码缺陷**：无语言块误走行内分支；应依据块级节点区分 | [代码分类](../../../src/components/common/MarkdownRenderer.tsx#L227) |
| `c++` 等语言标签 | 正则使用 `\w+` 提取 | **源码缺陷**：标签截断；未知语言最终行为待验证，需普通代码回退 | [代码分类](../../../src/components/common/MarkdownRenderer.tsx#L227) |
| 代码复制与折叠 | CodeBlock 有折叠，未提供复制；memo 超过 20 行默认折叠 | 新增复制与失败反馈；聊天默认展开、主动折叠 | [CodeBlock](../../../src/components/common/markdown/components/CodeBlock.tsx#L40)、[memo 配置](../../../src/components/common/markdown/utils.ts#L418) |
| 链接与 title | 普通链接存在；自定义 a 只取 href/children | **源码缺陷**：title、脚注锚点与 ARIA 丢失；安全转发必要属性 | [链接映射](../../../src/components/common/MarkdownRenderer.tsx#L370) |
| 脚注 | GFM 包含脚注解析；不需要据缺少独立插件推断缺失 | **源码缺陷**：a/li/h2 映射抹掉定位属性；sanitize 后最终 ID 与多消息回跳待实测 | [a](../../../src/components/common/MarkdownRenderer.tsx#L370)、[li](../../../src/components/common/MarkdownRenderer.tsx#L360)、[h2](../../../src/components/common/MarkdownRenderer.tsx#L303) |
| 数学公式 | 统一助手显式开启，旧剪藏聊天沿用 memo 默认关闭 | 统一策略并测公式 DOM；KaTeX 引擎与根 CSS 版本不同，尚未证明视觉故障 | [统一入口](../../../site/components/KnowledgeAssistant.tsx#L538)、[剪藏入口](../../../src/components/memos/ClippingDetail.tsx#L149) |
| Mermaid | 两条聊天路径明确关闭 | 首期继续显示代码文本，不执行图表；用户已确认不纳入 | [统一入口](../../../site/components/KnowledgeAssistant.tsx#L543)、[剪藏入口](../../../src/components/memos/ClippingDetail.tsx#L154) |
| 反斜杠与硬换行 | 预处理全局取消多种转义，替换 `<br>`，转换 TeX 分隔符 | **源码缺陷**：可能改变原意及代码；聊天绕过文章修复，按标准语法处理 | [cleanMarkdownContent](../../../src/components/common/markdown/utils.ts#L316) |
| 原始 HTML | 共享管线先 raw 再 sanitize，支持部分作者 HTML | 按确认策略，聊天禁止原始 HTML 成为 DOM，文章行为保留 | [rehype 管线](../../../src/components/common/MarkdownRenderer.tsx#L172) |
| 图片 | 共享图片处理与灯箱已存在 | 新增授权资源分类与外图主动加载；现有路径不等于符合新请求策略 | [图片管线](../../../src/components/common/MarkdownRenderer.tsx#L183)、[图片映射](../../../src/components/common/MarkdownRenderer.tsx#L261) |
| 音视频、iframe、交互嵌入 | 通用渲染器具有部分视频组件 | 首期范围外，聊天不继承这些执行或媒体能力 | [视频映射](../../../src/components/common/MarkdownRenderer.tsx#L273) |
| 正文 `[n]` 来源定位 | 无显式编号映射，UI 使用独立来源列表 | 用户确认本期保留独立列表，裸编号不自动绑定 | [来源列表](../../../site/components/KnowledgeAssistant.tsx#L559)、[引用去重](../../../src/server/assistant/runtime.ts#L142) |
| 未闭合 Markdown | 每次完整快照重新解析，没有专项稳定处理证据 | 测未闭合围栏、链接、表格与公式；不得把未执行测试称为流式故障 | [ReactMarkdown 输入](../../../src/components/common/MarkdownRenderer.tsx#L403) |

## 数据与运行入口

统一助手在每次请求完成后等待再读完整快照：生成期间约 650ms，空闲约 2400ms，实际更新间隔包含请求耗时；浏览器没有直接消费模型 Token SSE。旧剪藏面板通过 EventSource 读取 snapshot。因而首先测量每次完整快照的解析和提交耗时，再判断是否需要前端合并更新，不能默认按每 Token 重渲染设计优化。[轮询](../../../site/components/KnowledgeAssistant.tsx#L1047)、[客户端快照](../../../site/lib/assistant-client.ts#L93)、[剪藏订阅](../../../src/components/memos/ClippingDetail.tsx#L71)。

公开站隐藏旧剪藏聊天并使用统一助手；Console 剪藏详情仍可挂载旧面板。统一内容规则需要覆盖这条可达路径，不以此为由在本主题内迁移服务端对话模型。[页面条件](../../../site/components/pages/memo.tsx#L60)、[Console 挂载](../../../site/components/PublicMemoAuthoring.tsx#L1151)、[显示条件](../../../src/components/memos/ClippingDetail.tsx#L305)。

来源编号存在确定的映射缺口：提示按原检索顺序编号，而存储前按 `source:href` 去重并过滤；A、A、B 可在提示中成为 1、2、3，保存后只剩 A、B。引用行 UUID 在完成时生成，读取仅按同一批次可能相同的创建时间排序，不能反推原编号。[提示编号](../../../src/server/assistant/runtime.ts#L363)、[引用存储](../../../src/lib/assistant-storage.ts#L1351)、[读取顺序](../../../src/lib/assistant-storage.ts#L588)。

## 既有测试的局限

`MarkdownRenderer.test.tsx` 主要覆盖空内容占位；与 `CodeBlock.test.tsx` 合计 7 项基线测试已本地运行通过。既有助手 E2E 有粗体与列表断言，但断言必须限定单条助手消息的正文：来源列表本身也包含列表，多个粗体会产生多匹配，页面上出现一个 `ul` 不能证明答案正文的列表已正确解析。基线测试通过不代表本主题合同通过。[组件测试](../../../src/components/common/MarkdownRenderer.test.tsx#L12)、[E2E](../../../tests/e2e/web-demo/assistant.spec.ts#L175)。

脚注最终 DOM、未知语言回退、公式与 CSS 版本差异、图片请求策略、增量语法及移动端布局，需要在后续实施中补齐运行证据。

## 可复现的能力探针

运行 `bun install --frozen-lockfile` 后执行 `bun tests/fixtures/assistant-markdown/probe.ts`。探针输出 `diagnostic-observations` 和 `acceptance: not-evaluated`，已知缺口作为观察值记录，不提交故意失败的产品断言。JSDOM 不启用资源加载或脚本执行；所有外部样本使用保留的 `.invalid` 域名，探针不访问真实外部服务。样本与语义说明见 [fixtures](../../../tests/fixtures/assistant-markdown/README.md)。

| 探针 | 基线实际观察 | 能证明的范围与后续责任 |
| --- | --- | --- |
| `gfm-dom` | 标题可见；有序列表 `start=null`；两项任务框均 `disabled=true`；链接 `title=null`；脚注引用属性计数为 0；两格带 `whitespace-nowrap` | 证实 start/title 丢失及任务只读基础；renderer 补足语义属性，integration/regression 检查排版 |
| `code-dom` | 无语言、缩进、空块仍位于 `pre/code`，但错误应用行内代码类；`c++`、`objective-c`、未知语言 class 同时含原标签和截断标签；复制按钮 0 个；45 行代码默认折叠 | “误走行内分支”不等于完全失去 `pre`；未知语言本轮能读出原文，不宣称异常；code-blocks 实现源文复制与主动折叠 |
| `raw-html-dom` | 原始 `b` 形成 1 个元素，图片形成 2 个元素；脚本及 iframe 元素为 0 | 已有净化不等于 HTML 字面化合同；未执行脚本，不宣称浏览器安全验收通过 |
| `image-src` | 外图直接形成真实 `img src`；相对路径被改写为 `/api/files/local/assets/diagram.png`；同源路径也保留 | 证实没有本主题主动加载门禁；静态 DOM 不能证明实际请求数量或资源权限，media/regression 另验 |
| `footnote-instances` | 三实例均缺少 `data-footnote-ref`，未发现重复 ID | 不据空引用集合声称多实例隔离通过；renderer 恢复定位属性后使用 helper 检查关联和唯一性 |
| `source-rewrite` | `\*literal\*` 被改为 `*literal*`；`a<br>b` 被改为两个段落间隔 | 证实生产清洗会改写正文；聊天必须绕过，文章默认值由原组件保持 |
| `math-dom` | 该组合样本形成 5 个 `.katex`、1 个 `.katex-display`、0 个 `.katex-error`；尾文可读 | 其中包含文章清洗转换的旧 TeX 和无货币猜测的美元配对；仅说明生产公式输出路径，不证明聊天转义合同、错误提示、主题字体或 KaTeX CSS 版本一致 |
| `parser-code-values` | 标准解析器保留完整语言 token，并输出代码 AST `value` | 只作为 code-blocks/renderer 原文交接依据；AST 不包含 HAST 额外添加的末尾换行，复制不任意 trim |
| `entrypoints-source` | 两入口仍使用共享 MarkdownRenderer；统一入口存在 650/2400ms 完整快照轮询 | 只是源码指示；streaming/integration/regression 另验角色、终态、阅读位置和提交次数 |

危险输入探针会暴露基线 React 的空 `src` 警告；该警告是诊断输出，不是外图请求或产品安全测试通过的证据。

## 样本、正文定位与验收交接

| 需求 | 样本 | 后续验收 |
| --- | --- | --- |
| REQ-AMR-001、002、003 | `completeMarkdown`、`dualRoleMessages`、`escapingAndCurrency`、`footnoteInstances` | VER-AMR-001：相同原文双角色，软/硬换行、转义、嵌套/start、只读任务及三实例脚注 |
| REQ-AMR-004、005 | `codeCases`、`codeFixtures`、`escapingAndCurrency` | VER-AMR-002：空/未知/特殊语言、AST 原文复制与失败反馈、公式及字面美元 |
| REQ-AMR-006、007、008 | `maliciousHtml`、`externalImages`、`completeMarkdown` | VER-AMR-003：原始 HTML 字面化、协议拒绝、授权上下文、外图网络门禁、独立系统来源 |
| REQ-AMR-009 | `incrementalSequences` | VER-AMR-004：恢复、失败和取消；服务端正文与提交/取消次数，不能只测纯函数 |
| REQ-AMR-010 | 长代码、表格、`externalImages` | VER-AMR-005：三尺寸、两主题与两入口，局部横滚、主动折叠、历史阅读位置 |
| REQ-AMR-011 | 未闭合围栏/链接/表格/公式及 `stopped`、`failed`、`recovered` 序列 | VER-AMR-006：最新终态与一次性结果比较，旧工作不能覆盖，单消息异常隔离 |

共享 helper 的正文边界是 `[data-presentation-id][data-message-id]` 下唯一的 `[data-message-body]`；系统来源必须在正文边界外。`messageBodySelector` 同时供 DOM 与 Playwright 使用；`getMessageBody` 对零个或多个匹配报错，避免误将来源列表当成正文。`inspectFootnoteReferences` 检查真实引用/目标/回跳和 ARIA 关联，`duplicateIds` 检查同页重复 ID；调用方必须另外断言预期引用数大于零，不能把空集合当成功。属性由 streaming 的消息入口提供，integration 复用，不引入单独页面或测试专用产品路由。

完整序列是完整快照而非 token delta，身份在同一序列中稳定。恢复序列用于终态优先验证；关闭/导航/后台恢复与故障注入仍需对应任务的产品组件与服务端断言。本 audit 不以样本自身的相等性测试替代这些验收。
