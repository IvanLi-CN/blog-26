# Style Playbook集成实现状态

## Current Status

- Lifecycle: active
- Implementation: 博客消费端已实现，正在完成交付验证与独立审查；上游公开资产与通知由独立任务实现。
- Catalog note: 原生Playbook、内容 workflow 和 console 持久快照已落地，生产接入及自动更新默认关闭。
- `REQ-PBI-012` 至 `REQ-PBI-015` 已实现内容聚合、章节展开和零占位高亮；主线同步后的自动验证通过，搜索视觉确认与正式审查待完成。

## Implementation Coverage

| Requirements | 实现 | 验证 |
| --- | --- | --- |
| `REQ-PBI-001`、`REQ-PBI-002` | Astro 原生目录与详情、真实标题层级、静态子标题 anchor 与当前阅读位置、受控 Markdown、关系、公开文件树和高亮预览及匿名 Policy 资源；严格公开包校验和归档安全检查 | `playbook-contract.test.ts` 的完整公开样例、私有字段拒绝、损坏归档与 SSR；`playbook-outline.test.ts` 的已有编号、重复标题与锚点一致性；`playbook-resources.test.tsx` 的原文保真、惰性 HTML、同版下载链接及文件引用；正式 `/playbook/` Web Demo 路由检查；Storybook 仅保留资源浏览器组件场景 |
| `REQ-PBI-003`、`REQ-PBI-004` | 固定 Release 元数据复核、tag commit 核对；首次引导与每小时补漏都选择最高就绪稳定 SemVer，手动入口默认 reconcile | 模拟 GitHub reader 检查 draft、prerelease、身份不符与最高就绪稳定 SemVer |
| `REQ-PBI-005`、`REQ-PBI-006` | 内容刷新复用已部署 renderer 和独立文章/Memo 快照；正常前端与内容/回滚 job 共享排队锁，锁内重建 | 部署适配器检查幂等、迟到、变化后重建、失败不采用及显式暂停回滚；workflow 结构测试 |
| `REQ-PBI-007` | edition 包含 renderer、来源包和完整公开文件摘要；同批指针、页面、搜索、资源及原始包，保留前一版 | 静态产物校验、身份重算、旧文件保留、不可变与重新验证缓存策略测试 |
| `REQ-PBI-008`、`REQ-PBI-009` | console 启动加载持久缓存/固定 seed，立即和每 300 秒单任务同步；完整验证后原子采用 | 可控时钟、断网/损坏/schema 不兼容、重启、缓存优先、首次 HTTP SSR 及指定 edition 搜索 |
| `REQ-PBI-010`、`REQ-PBI-011` | MiniSearch 中英文分词、Policy 独立文档、五类过滤、按来源分组；请求/采用身份记录和整体回滚入口 | 确定性检索、API 409、正式 `/search` Web Demo 路由、搜索组件 Storybook 场景及构建/部署适配器测试 |
| `REQ-PBI-012` | 展示层 SearchResultGroup 按来源、类型和规范路由归组；同 edition catalog 提供权威标题与章节位置，单章节直接作为主入口 | Playbook 身份、标题、锚点、Policy/栏目及缺失公开对象测试；文章/Memo 跨类型身份回归 |
| `REQ-PBI-013` | 独立主链接、章节链接和展开按钮；默认三章节，查询重置、类型筛选保留展开 | 0/1/2/3/5 章节组件测试；1280/393/320px 明暗主题的展开、筛选、查询、键盘与触控 Storybook 断言 |
| `REQ-PBI-014` | 全部合格命中先聚合后限制内容数；最高命中排名，独立来源上限与内容计数；v5 edition 缓存 | 60 个同页 Playbook 命中、250 个同路由全文命中、语义去重、缓存恢复及旧缓存拒绝回归 |
| `REQ-PBI-015` | 主片段与章节共用内联 mark；仅颜色和背景强调，零 padding/margin/border，继承字体、字重与断行属性 | 字体加载后的逐字符几何、换行、容器尺寸、复制及代码缩进对比；六组视口/主题场景 |

## 搜索实现

[Playbook 查询](../../../src/lib/playbook/search.ts) 用搜索页已绑定 edition 的最小 pages 元数据识别内容；整页、章节和命令归入一个规范路由。未知锚点回退页面且不生成子入口，缺少公开父对象仍作为来源失败处理。父结果按最高单命中分数及原同分顺序排序；章节按锚点去重，按相关性和正文顺序排列。栏目索引保留独立结果，Policy 使用阅读页的安装和资源锚点。

文章/Memo 语义结果和短文本全文结果在排序后按类型及 slug 去重，再截断；纯 FTS 用物化 BM25 候选和分组窗口选最佳行后 LIMIT。公开响应仍为 JSON 数组。短文本路径不再预截取固定数量的原始行，避免重复内容耗尽候选。公共页面与缓存消费同一展示模型，章节及展开不计入内容数量。缓存恢复同时校验可选标题、片段、入口、来源、类型和分数字段，损坏记录视为未命中，避免存储数据导致结果组件报错。

高亮保留原文字切片，并通过普通内联 mark 继承上下文排版。代码块保留既有 Markdown 展示缩进规则；高亮开关不改变复制文本或字符位置。浏览器验收包含重复中文、紧邻标点、中英文、部分连字、长行及代码。

## Validation Evidence

搜索聚合候选同步到主线 `295f37394cc8f649bd501a353e2670a58dd5a816` 后，在会话 Agent VM 使用 Bun 1.4.2、Node 22.12.0 与 Playwright Chromium 执行验证：`bun run test:precommit` 为 812 pass、0 fail，32 个搜索 Storybook play 场景通过；`bun run check` 无失败，仅有三条既有告警。文件权限回滚测试在移除 VM root 的 DAC 绕过能力后执行，保持只读文件的真实权限语义。

`VER-PBI-012` 与 `VER-PBI-014` 覆盖权威标题、章节/命令归组、跨类型身份、单章节入口、缺失父对象和锚点回退，以及 Playbook 60 命中、全文 250 重复行、语义去重与 v5 缓存；`VER-PBI-013` 覆盖章节数量边界、展开/收起、筛选保留、新查询重置、无嵌套入口、Tab 顺序、44px 目标和无横向溢出。`VER-PBI-015` 等待字体加载后，在 1280/393/320px 明暗主题中逐字符比较文字坐标、尺寸、断行和复制文本，包含部分连字与代码；所有差异不超过 1 CSS px，断行和复制完全一致。

当前源码的 Storybook、独立 Web Demo、静态站和 console 构建通过；Playbook artifact 校验和静态 HTML、首次 console HTTP SSR、edition 搜索 smoke 通过。页面证据从 Web Demo 的 `/search/?q=版本` 捕获，组件展开证据从 `Public/Search Results/Expanded` 捕获；截图确认前不将候选图片写为正式 Spec 资产。

页面级验证使用独立的 Web Demo 构建物；实际静态 HTML 和 console 首次 HTTP 响应包含 Playbook 正文、anchor 及同一 edition，指定搜索 edition 可读取，未知 edition 返回 409。正式路由上的共享 Inspector 提供可复现的场景、身份、网络、数据、模拟操作和 `d_*` 分享状态，并且不触达真实写接口。Storybook 构建只验证组件/资源/搜索状态，不再承担页面级证据。仓库测试与提交门禁测试均通过后，需重新验证受影响的静态站、Web Demo 构建、Storybook 构建与 HTTP SSR。`bun run check` 保留仓库既有告警，不引入新的检查失败。

视觉证据覆盖 390/768/1280 宽度及明暗主题，使用公开控制样例，无登录或来源仓库访问。Spec 中保存已确认的证据。正文前目录复用 `nature-panel nature-mobile-reading-surface`：640–1023px 呈现与正文一致的主题卡片，小于 640px 由共享响应式契约覆盖为全宽平面阅读层。768px 明暗主题场景直接比较目录与正文的背景、边框、圆角、阴影与宽度，截图见 Spec；移动端平面目录与桌面吸附目录回归另行验证。当前 Candidate 的正式审查和 live PR 状态仍属于交付门禁，尚未通过的门禁不计为已完成验收。

Policy 公开资源使用 SSR 文件浏览器：可收起的原生目录树、精确文本源码、现有主题高亮、Markdown 阅读/源码切换与同版下载。公开资源与正文、目录为同层区域，正文结束后独占一行：桌面端主题卡片横跨两栏，移动端复用 `nature-mobile-reading-surface` 的全宽平面阅读承载层，按共享边距内缩内容，去掉外层圆角、边框和阴影；展开文件树时仅在树内定位当前文件，保持页面阅读位置。资源标题右侧提供放大/退出按钮。通过原生 dialog 的 top layer 铺满视口，将同一个工作区移入其中，保留现有文件、预览方式与阅读状态，避免重复渲染和文件 ID 冲突；原位置保留等高占位。放大时锁定页面滚动并使用原生模态焦点约束，退出、原生取消和卸载统一恢复工作区、页面 overflow 与焦点；移动文件树优先响应 Escape。全屏工作区采用 dvh 与安全区边距，目录仍按当前工作区的容器宽度使用侧栏或浮层。手动安装与依赖规则仍在正文。文件树与原文源码使用透明底色，与工具栏一起透出同一资源卡片表面，保留分隔线与文件选中状态。Astro 使用局部 DOM 增强，页面请求不加载上游；无 JavaScript 通过原生折叠文件预览阅读。受控样例覆盖多级目录、脚本、Markdown、JSON 与未知扩展文本。文件预览的 6 个单元测试、栏目与搜索 Storybook 交互场景及静态站、console、Storybook 构建通过；HTTP 下载内容与采用版本的文本逐字一致。公开资源的桌面、移动与明暗主题场景核对正文分离、单行全宽及文件下载；移动场景还检查共享阅读承载层的两侧位置、12/16px 阅读边距、零圆角/阴影/外边框及 44px 文件和工具控件触控目标。390/320 宽度未出现横向溢出，关闭目录后保留当前文件，重新展开可恢复选择；公开脚本样例的源码文字最低实测对比度为浅色 4.96:1、暗色 8.67:1。Markdown 阅读先提取 frontmatter，以紧凑键值列表呈现元数据，避免分隔符被误识别为正文标题；使用现有 js-yaml 的数据 schema，解析失败保留元数据原文，完整源码和同版下载不变。验证覆盖 YAML、JSON 形式元数据、多行文本、嵌套值、BOM/CRLF、非法标签、重复键与正文分隔线，另有 Skill 阅读/源码切换的桌面、移动及明暗 Storybook 场景。增强预览按稳定视口高度分配工作区：桌面为 68svh、限制在 28–40rem，移动端为 70svh、限制在 28–36rem。切换文件、阅读/源码与文件树显隐保持工作区总高；工作区宽度小于 640px 时，文件树默认收起，以工具栏下方的非模态浮层展示，宽度不超过 18rem、高度不超过 26rem 且限制在工作区内，预览区域不因展开而缩小。文件选择、点击浮层外部、关闭按钮和 Escape 均可收起；关闭按钮与 Escape 返回工具栏焦点，展开后聚焦并在树内显示当前文件。开合采用 160ms 位移与透明度动画，尊重减少动态效果偏好；快速切换会取消前次动画，收起时立即移出可访问性与键盘焦点路径。ResizeObserver 在工作区宽度跨越断点时恢复适当的侧栏/浮层状态，并在卸载时清理事件、动画与观察器。文件树、阅读与源码各自滚动，工具栏固定。长路径省略展示并保留完整文本与悬停提示；无 JavaScript 仍使用原生折叠项的自然文档高度。11 个受影响的 Storybook 交互场景通过，覆盖浮层几何尺寸、选择后收起、外部点击、Escape、焦点返回、默认收起，以及长文、120 行脚本与短文本在 1280、390、320 宽度的切换；键盘可滚动至阅读与源码末尾，页面无横向溢出。静态站、console 与 Storybook 构建通过。仓库 `AGENTS.md` 与根 `DESIGN.md` 指向 Nature UI 响应式契约和 ADR 0003，功能 Spec 明确继承共享规则。放大显示另有 7 个桌面、平板、移动及窄屏交互场景，检查视口尺寸、原 DOM 和当前文件不变、阅读/源码及滚动位置、按钮/Escape/原生取消退出、背景滚动锁定与焦点返回；浏览器真实 Tab 与 Escape 输入验证模态焦点约束和退出清理。内部滚动位置在 DOM 移入/移出 dialog 前保存，并按可见滚动区恢复；不同文件和预览模式的滚动位置分别记录。文件浏览器截图经主人确认后保存为正式证据。

## Remaining Gaps

- 完成同步主线后的当前候选验证、搜索视觉确认、独立审查和 live PR 门禁；实现覆盖不等同于交付完成。
- 上游原生 Release 负责发布可重复公开包，并在数据包之后最后上传 manifest；博客通过每小时补漏读取最新就绪稳定版，不要求上游调用博客 Actions API。见 [公开包契约](./contracts/public-package.md) 和 [触发契约](./contracts/release-trigger.md)。
- `PLAYBOOK_SOURCE_TOKEN` 提供上游只读访问；生产更新仍须在首次应用部署验证指针后手动启用。首次引导自动选择最高的就绪稳定 SemVer，不需要固定 Release ID。
- 真实 EdgeOne 原子发布、生产指针及 console 五分钟跟随由两仓合并后的上线阶段验证；模拟适配器与本地 HTTP 结果不替代生产验收。
- 本任务停在 merge-ready，不合并、不触发真实 Release、不配置远端凭据。上线顺序和暂停/回滚流程见 [发布 runbook](../../runbooks/style-playbook-publishing.md)。

## References

- [长期需求](./SPEC.md)
- [公开包契约](./contracts/public-package.md)
- [Release 触发契约](./contracts/release-trigger.md)
- [研究基线与主题历史](./HISTORY.md)
- [ADR 0011](../../adr/0011-published-playbook-read-model.md)
