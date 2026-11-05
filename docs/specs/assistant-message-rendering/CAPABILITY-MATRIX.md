# 当前能力与缺口

本表基于本地基线 `cae60a01576256da1849e5e4898232d952bd6544` 的源码与既有断言审查。它不是浏览器复测报告，本轮未安装依赖、运行产品测试或生成截图。用户提供的截图证明当时列表和粗体标记以原文显示；当前基线已经接入 `MarkdownRenderer`，因此不能以该截图宣称当前版本仍未接入解析器。

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

`MarkdownRenderer.test.tsx` 主要覆盖空内容占位。既有助手 E2E 有粗体与列表断言，但断言必须限定单条助手消息的正文：来源列表本身也包含列表，多个粗体会产生多匹配，页面上出现一个 `ul` 不能证明答案正文的列表已正确解析。本轮只审查源码与既有断言，没有报告这些测试已重新运行或通过。[组件测试](../../../src/components/common/MarkdownRenderer.test.tsx#L12)、[E2E](../../../tests/e2e/web-demo/assistant.spec.ts#L175)。

脚注最终 DOM、未知语言回退、公式与 CSS 版本差异、图片请求策略、增量语法及移动端布局，需要在后续实施中补齐运行证据。
