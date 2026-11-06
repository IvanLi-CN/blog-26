# 助手 Markdown 样本与接口交接

本目录是输入与预期语义合同，产品需求见 [SPEC](../../../docs/specs/assistant-message-rendering/SPEC.md)，基线观察见 [能力矩阵](../../../docs/specs/assistant-message-rendering/CAPABILITY-MATRIX.md)。fixtures、探针和 helper 均不表示最终渲染器已通过验收；不要给样本写镜像相等断言后将其报告为产品测试通过。

## 使用样本

从 `tests/fixtures/assistant-markdown/index.ts` 导入；每项正文保留原始字符串、角色、状态、消息与呈现实例身份。`assistantMarkdownFixtures` 汇总完整、转义/货币/数学、恶意 HTML、外图与代码样本，并携带需求及验收编号；`dualRoleMessages` 以完全相同原文检查用户字面显示与助手语义显示；`footnoteInstances` 覆盖同页两条消息和同一消息的另一呈现。

`codeCases.source` 是 Markdown AST 的代码 `value`，复制必须等于它；围栏结构行及 Markdown-to-HAST 额外加入的末尾换行不属于此字段。无语言样本特意保留 AST 原文末尾的空行：不能以 `trim()` 或无条件去尾换行替代结构识别。解析器真实值由 `parser-code-values` 探针显示；语言完整保留 `c++`、`objective-c`、`amr-unknown+v1`。Mermaid 保持代码，不执行图表。

`incrementalSequences` 按数组顺序提供完整快照，涵盖空 pending、生成中未闭合围栏/链接/表格/公式、completed/cancelled/failed 与恢复后的终态。终态可与一次性挂载最终快照比较；旧异步工作、错误边界、保存原文、发送/停止次数和阅读位置需由实际组件或端到端测试验证。不要自动补齐语法，不能因快照序列本身合理而宣称生命周期通过。

外图域名全部是 `.invalid`，供浏览器路由拦截后确定性返回图片或错误；不能依赖真实 DNS/公网图片。`externalImages` 也含缺少上下文的相对路径及同源未授权地址。`imageResourceCases` 提供授权相对路径、拒绝同源及缺少上下文三种可信测试适配器输入；`/api/test-facade/amr/diagram.png` 是需测试拦截的虚构 URL，不是真实产品端点。不能在模型正文或 fixture 中加一个 `authorized: true` 来绕过分类；真实权限合同仍沿用现有服务边界。

## 共享接口

类型唯一来源为 [conversation/types.ts](../../../src/components/common/conversation/types.ts)，只含类型和 type-only React import，不导入尚未实现的渲染器、传输或服务端模块。

| 消费方 | 类型与字段 | 责任 |
| --- | --- | --- |
| streaming/integration | `ConversationMessage`: `messageId/presentationId/role/content/status`；`AssistantMessageContentProps` 另含 `renderMarkdown/resourceContext/className` | 用户原样显示；只给助手注入正文组件；状态保持 pending/streaming/completed/failed/cancelled；过滤内部消息 |
| renderer | `ConversationMarkdownProps`: `messageId/presentationId/content/resourceContext?/className?` | 标准 CommonMark/GFM+数学，HTML 节点字面化，安全链接、脚注和局部组件；不执行文章清洗 |
| code-blocks | `ConversationCodeSource` 与 `ConversationCodeBlockProps`: `source/language?/className?` | `source` 复制保真、块级身份来自 AST/pre、完整语言标签、高亮失败局部回退、默认展开 |
| media | `ConversationImageProps`: `messageId/presentationId/src/alt/title?/resourceContext?/className?` | `src` 是确切源 URL；逐消息与呈现实例选择加载；协议校验先于任何请求 |
| 可信资源适配器 | `ConversationImageResourceContext.resolveAuthorizedImage(src)` → `{ src: finalFacadeUrl }` 或 `null` | 仅现有已授权资源边界可返回 final URL；同步且无请求，不将同源或第一条引用当成权限证明 |

`renderMarkdown` 的类型为 `ComponentType<ConversationMarkdownProps>`，使用 React 组件插槽：streaming 内解构为 `renderMarkdown: Markdown` 后渲染 `<Markdown ... />`，测试可注入简单组件。renderer 集成后由调用方传入 `ConversationMarkdown`，streaming 不提前 import 它。用户分支不调用插槽。来源记录不属于这些正文类型，由外层系统来源列表继续持有。

外图授权标识使用 `ConversationImageConsentIdentity` 的 `presentationId/messageId/src` 三元组。任何一项变化重新等待选择；同消息中同一确切 URL 可共享这次选择，但不能顺带加载不同 URL、域名其他图片或灯箱中未选内容。`ConversationAuthorizedImage` 是可信应用边界的解析结果，仍需 media 验证 URL 协议；接口本身不授予服务器权限，也不新增代理端点。

## 正文定位与可执行诊断

streaming 在消息根提供 `data-presentation-id` 和 `data-message-id`，正文独立提供 `data-message-body`。失败提示、操作和来源列表放在正文外，避免正文断言匹配外层列表。角色/status 可保留现有属性，不要求新增 API 字段。helper 的 `messageBodySelector` 可直接给 Playwright locator；`getMessageBody` 要求唯一匹配；脚注 helper 检查当前正文的定位关联，测试还必须断言预期引用数及全页 ID 唯一。

执行 `bun tests/fixtures/assistant-markdown/probe.ts` 获得静态生产 DOM、生产清洗及锁定标准解析器的诊断观察。退出成功只代表探针运行完成；输出中明确记录观察错误和 `acceptance: not-evaluated`。探针不启用 JSDOM 资源/脚本、不发外图请求、不调用真实模型、不截图。点击前零请求、用户操作、剪贴板、布局和生命周期由后续产品测试验证。

执行 `bunx tsc -p tests/fixtures/assistant-markdown/tsconfig.json` 静态检查共享接口、样本消费者及 helper；执行 `bun test tests/fixtures/assistant-markdown/contract-helper.test.ts` 验证定位与脚注检查工具本身。helper 测试使用标准解析器生成的真实脚注 DOM，包含重复 ID、缺失回跳、跨消息定义及无效 ARIA 关联的拒绝场景；这些是证据工具测试，不计为产品语义通过。
