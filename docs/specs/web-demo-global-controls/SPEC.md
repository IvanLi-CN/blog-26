# Web Demo 全局 Inspector 控制

## Context and Scope

- Context: Inspector 需要提供含义稳定、可组合、可跨正式路由和场景保持的全局环境控制。
- In scope: 模拟身份、模拟网络连接、默认请求延迟、产品主题、动效偏好；这些控制的常驻与高级展示、状态同步和实际生效合同。
- Out of scope: 数据规模、业务请求结果、内容边界、媒体状态、场景参数与动作、分享工具布局、请求或修改记录、重置工具、Inspector 停靠断点与几何布局，以及公共产品路由从 HTML 文档交换迁移为 CSR 数据加载。
- 既有 Web Demo 正式路由、构建时隔离和完整 Inspector 合同继续有效。本主题只拥有全局控制，不能扩展为完整 Inspector 重做或业务故障注入合同。

## Terms and Interfaces

- 术语以 [CONTEXT.md](../../../CONTEXT.md) 中的 Web Demo 全局控制、Web Demo 会话、Inspector 常驻控制和 Inspector 高级控制为准。
- 全局指同一 Web Demo 会话的共享环境，不指真实登录、操作系统、浏览器其他标签或其他站点。
- 常驻指打开 Inspector 的全局控制区域后，无需展开高级区即可操作；不要求 Inspector 永久展开或固定侧栏。
- 网络控制作用于 Demo 接管的产品请求。Inspector 启动所需的文档、脚本、样式和开发工具连接不属于模拟网络。
- 直接打开与刷新得到的 SSR 首屏属于已有内容；客户端产品/API 请求是模拟连接与延迟的作用边界。Web Demo MUST NOT 在共享布局叠加人工失败面板，或复制产品页面制造一套演示加载流程。
- 客户端导航和客户端渲染不是同一概念；Astro `ClientRouter` 获取目标 HTML 的文档交换不得被称为完整页面 CSR。公共路由的 CSR 数据加载必须由正式产品与 Demo 共用，其迁移由独立公共路由合同拥有。

### Control Catalog

| 控制项 | 取值 | 常驻展示 | 高级展示 |
|---|---|---|---|
| 模拟身份 | 未登录、普通用户、管理员 | 完整选择器 | 无 |
| 网络连接 | 在线、离线 | 完整选择器 | 无 |
| 请求延迟 | 正常、慢速、自定义 | 正常与慢速选择；自定义生效时展示当前值 | 自定义延迟启用与毫秒输入 |
| 产品主题 | 浅色、深色、跟随系统 | 完整选择器 | 无 |
| 动效偏好 | 跟随系统、减少动效 | 高级区折叠时的生效摘要 | 完整选择器 |

### Inspector Visual Grouping

- Inspector 主滚动区采用连续的单列工作流；`全局环境`、`Scene`、`Data` 和 `Actions` 是同一主工作流中的相邻分组，使用明确标题、内容间距和一致的标题层级表达分组，不使用组间横向分隔线。
- 头部、`SIMULATED` 状态条和主滚动区通过层级、留白和状态样式衔接，不在头部与状态条之间增加装饰性分隔线；状态条本身仍保留可识别的状态徽标和路径信息。
- `高级` 属于`全局环境`，必须保持全宽、与全局控件左边界对齐；不得使用缩进、左侧轨道、独立背景、圆角容器或独立分隔线制造额外层级。
- `分享与记录`属于折叠的次要工作流，可以在其顶部保留唯一的边界线；该边界用于区分主工作流与次要工具，不能复制到主工作流的每个分组之间。
- 分隔线只能表达交互语义或工作流边界，不能用于补偿标题、控件和组间距不足；新增分隔线前必须说明其边界对象和不可替代的交互含义。

### State Interface

| 全局状态 | 分享参数 | 接受值 |
|---|---|---|
| 模拟身份 | `d_persona` | `guest`、`user`、`admin` |
| 网络连接 | `d_connection` | `online`、`offline` |
| 请求延迟模式 | `d_delay` | `normal`、`slow`、`custom` |
| 自定义附加延迟 | `d_delay_ms` | 0 至 30000 的整数，单位为毫秒；只在自定义模式生效 |
| 主题偏好 | `d_theme` | `light`、`dark`、`system` |
| 动效偏好 | `d_motion` | `system`、`reduce` |

- 正常模式不额外增加环境延迟；慢速模式统一增加 1500 毫秒。产品动作自身已有的模拟处理时间保持其业务含义。
- 首次进入且没有明确 URL 或既有会话配置时，身份和主题采用产品入口既有默认值；网络在线、延迟正常、动效跟随系统。后续导航不能重新应用入口默认值覆盖用户选择。
- 既有 `d_network=healthy|slow|offline` 链接分别映射为在线正常、在线慢速、离线正常；有效的新参数优先。其他非全局参数保持其既有所有权，不成为本合同的全局输入。

## Requirements

### REQ-WDG-001 — Global Ownership

- 全局控制 MUST 仅拥有控制目录中的五项环境状态。
- 控件在多个场景中复用、使用同一组件、或者能写入分享 URL，MUST NOT 被当作全局状态归属的依据。
- 路由或场景选择 MUST NOT 覆盖明确选择的身份、连接、延迟、主题或动效状态。

### REQ-WDG-002 — Persistent and Advanced Presentation

- 身份、网络连接、预设请求延迟和主题 MUST 常驻，保持固定顺序和明确标签。
- 高级区 MUST 只包含自定义请求延迟和动效偏好，首次进入默认折叠；其展开偏好在同一会话的导航中保留。
- 折叠高级区 MUST NOT 停用其中的设置。自定义延迟或减少动效启用后，标题 MUST 展示已启用项数量，并提供可读摘要，例如“自定义延迟 2300 ms · 减少动效”。
- 高级区没有启用覆盖时，折叠态摘要 MUST 表达“展开设置”，展开态摘要 MUST 表达“收起设置”，不得使用“暂无高级设置”之类否认控件存在的文案。
- 自定义延迟启用时，常驻区 MUST 明确显示当前自定义值，不能同时声称正常或慢速预设被选中。

### REQ-WDG-003 — Independent Inputs

- 五项全局状态 MUST 可以独立设置，修改其中一项不能隐式修改其他项。
- 网络离线可以和任意延迟组合；离线时延迟配置被保留，但不拖延离线失败。恢复在线后使用保留的延迟配置。
- 场景中的既有业务状态不能反向修改全局环境；全局环境本身不重置业务数据或内存模型。

### REQ-WDG-004 — Simulated Identity

- 未登录 MUST 对应没有用户对象的模拟会话；普通用户 MUST 对应已登录且没有管理员权限；管理员 MUST 对应已登录且拥有模拟管理员权限。
- 身份切换 MUST 更新产品已有的会话、权限判断和适用界面。匿名公共阅读页面可以保持相同视觉，不额外创造产品本身没有的管理控件。
- 身份控制 MUST 不建立真实登录、不赋予真实权限，并且在路由拒绝访问时仍可由 Inspector 调整。

### REQ-WDG-005 — Simulated Connectivity

- 在线 MUST 通过 Demo 的既有模拟响应路径处理产品请求。
- 离线 MUST 让所有 Demo 接管的客户端产品请求以连接失败结束，包括模拟会话读取、初始客户端业务读取和后续产品操作；不能用统一 HTTP 503 冒充断网。已经由 SSR 提供并展示的首屏数据属于已有内容，不得因客户端离线判定被清空。
- 离线首屏 MUST 保留已经由 SSR 提供的内容，不得额外制造模拟网络失败提示、隐藏快照或回退真实后端。
- 离线失败 MUST 由实际发起的产品/API 请求产生，并使用对应产品界面的加载、错误与恢复状态。不得在 `BaseLayout` 或共享布局中制造统一页面错误。外部链接、下载链接和同文档锚点不属于产品数据读取范围。
- 离线 MUST NOT 回退到真实后端、修改浏览器或系统网络设置，或阻止 Inspector 自身启动和恢复在线。
- 已显示的内容和既有内存数据不因切换连接状态被全局主动清空；产品按其真实加载、错误与恢复合同处理请求结果。

### REQ-WDG-006 — Request Delay

- 请求延迟 MUST 作为同一环境策略作用于 Demo 接管的所有产品请求，使用统一预设和毫秒单位。
- SSR 首屏 MUST 不因全局网络或延迟设置额外制造客户端重复读取；后续客户端数据加载沿用正式产品路径并承接同一请求策略，不能重复叠加。
- 自定义值 MUST 是 0 至 30000 的有限整数；无效输入展示字段错误，不改变已生效的值。
- 选择正常或慢速预设 MUST 退出自定义模式；开启有效的自定义值 MUST 退出预设模式。关闭自定义模式恢复正常模式。
- 延迟控制 MUST 不直接伪造成功、HTTP 错误或超时结果；这些不是本合同的全局控制项。
- 快速切换环境时，过时请求不能覆盖新环境产生的有效结果，加载状态必须能够结束或被取消。

### REQ-WDG-007 — Theme Synchronization

- 全局主题 MUST 使用产品已有的主题模型与组件，覆盖产品界面和 Inspector。
- Inspector 与产品主题控件 MUST 双向同步，不产生两份互相冲突的主题状态。
- 跟随系统 MUST 使用当前系统偏好，并响应系统变化；固定浅色或深色 MUST 保持所选主题。
- 分享 `system` 代表恢复跟随系统这一偏好，不承诺在不同设备上得到相同解析主题；需要固定视觉时使用明确浅色或深色。

### REQ-WDG-008 — Motion Preference

- 动效偏好 MUST 作用于产品中已有的动效与环境背景，而非只作用于 Inspector。
- 跟随系统 MUST 遵守系统减少动效偏好；减少动效 MUST 强制采用产品减少动效表现。
- 高级区 MUST 不提供绕过系统减少动效偏好的强制完整动效模式。
- 动效变化 MUST 不修改业务数据、网络状态或主题。

### REQ-WDG-009 — Navigation and Reproduction

- 有效 URL 参数 MUST 优先于同一会话中对应字段的选择；缺少的字段继续使用会话值，仅在没有会话值时使用入口默认值。
- 同一 Demo 会话在正式路由与场景之间导航、前进、后退或刷新时 MUST 恢复对应全局环境，包含高级区中的有效配置。
- 状态参数写入与读取 MUST 保留正式路由和其他产品参数，并按状态接口兼容既有网络参数。
- 环境控制更新 MUST 使用运行时状态同步，不通过完整 document reload 掩盖同步问题。
- 高级区展开与面板显隐属于本地展示偏好，MUST NOT 混入可分享的产品环境状态。

### REQ-WDG-010 — Product Reuse and Build Isolation

- 全局能力 MUST 接入正式产品的会话、请求、主题和动效路径，使用项目已有 UI 组件及键盘、焦点、选择状态语义。
- 改变控件 MUST 产生合同对应的实际行为；仅修改 URL、DOM 标签或提示文案不算实现。
- 全局控制 MUST 只存在于构建时选定的 Web Demo 制品中，不为 live 制品增加运行时 Demo 开关、并行演示路径或页面 Story。
- 本主题不修改已确认的 Inspector 停靠几何布局与产品可用区域合同。

## Verification

### VER-WDG-001 — Ownership and Navigation Invariants

- Method: 全局状态边界测试及正式路由导航验证。
- covers: REQ-WDG-001、REQ-WDG-003
- Pass condition: 全局状态只包含五项环境输入；逐项修改独立，跨场景保留明确值；业务数据和场景状态不被全局切换主动重置。

### VER-WDG-002 — Control Presentation

- Method: Inspector 控件交互与受控浏览器证据。
- covers: REQ-WDG-002、REQ-WDG-010
- Pass condition: 四项常驻控制顺序一致，高级区只含自定义延迟与动效；展开状态保留；折叠后启用数量、摘要和自定义值准确，控件使用项目 UI 组件并支持键盘与可见焦点。

### VER-WDG-003 — Identity Semantics

- Method: 三种模拟会话的响应与产品权限界面验证。
- covers: REQ-WDG-004
- Pass condition: 未登录没有用户对象，普通用户已登录但非管理员，管理员具有模拟管理员权限；状态切换更新已有界面且不触达真实登录或写接口。

### VER-WDG-004 — Offline and Recovery

- Method: 确定性请求拦截及产品加载、失败、恢复验证。
- covers: REQ-WDG-005、REQ-WDG-003
- Pass condition: 离线覆盖 Demo 接管的模拟会话和客户端业务请求，表现为连接失败且没有真实后端回退；直接打开与刷新的 SSR 内容保留；Memos、搜索、评论、反应及产品路由读取器在对应产品界面承接失败；没有额外共享错误面板；Inspector 可恢复在线，连接切换不清空已有业务内存数据并保留延迟选择。公共页面导航是否由 CSR 数据读取承接，按独立公共路由合同验证。

### VER-WDG-005 — Delay and Request Races

- Method: 可控时钟、字段验证与快速环境切换验证。
- covers: REQ-WDG-006
- Pass condition: 各模拟产品请求采用相同附加延迟；只有 SSR 内容的页面不额外发起首屏 CSR 请求；正常、1500 毫秒慢速与合法自定义值生效；非法值保留当前配置并报错；旧请求不能覆盖新环境，延迟不改变业务响应结果。

### VER-WDG-006 — Product Theme

- Method: 产品与 Inspector 主题控件互操作，以及系统偏好变化验证。
- covers: REQ-WDG-007
- Pass condition: 两端控件双向一致，产品和 Inspector 均随浅色、深色、系统偏好变化；明确主题不被系统变化覆写。

### VER-WDG-007 — Reduced Motion

- Method: 产品动效及环境背景的系统偏好与强制减少动效验证。
- covers: REQ-WDG-008
- Pass condition: 跟随系统遵守减少动效，强制减少动效作用于实际产品动效，控件不提供强制绕过系统偏好选项。

### VER-WDG-008 — State Round Trip

- Method: 全局参数序列化、兼容链接与跨正式路由浏览器验证。
- covers: REQ-WDG-009
- Pass condition: 所有有效环境输入可恢复，URL 与会话优先级逐字段准确，旧网络值映射正确；正式路由和产品参数保留；前进、后退、刷新及运行时变更同步正确，展示偏好不进入分享状态。

### VER-WDG-009 — Demo Artifact Boundary

- Method: 独立 live/Demo 制品边界检查及正式产品路径验证。
- covers: REQ-WDG-010
- Pass condition: live 制品不能由全局参数开启 Demo，Demo 控件沿用产品 UI 与正式路径；没有新增页面 Story 或独立演示路径，既有停靠布局不因本主题变化。

## Related ADRs

- [Build-time Web Demo and story boundary](../../adr/0013-build-time-web-demo-and-story-boundary.md)
- [Web Demo global Inspector controls](../../adr/0014-web-demo-global-inspector-controls.md)

## References

- [Implementation coverage](./IMPLEMENTATION.md)
- [Topic history](./HISTORY.md)
- [Product glossary](../../../CONTEXT.md)
- [Public UI design](../../../DESIGN.md)
- [Nature frontend contract](../nature-front-ui/SPEC.md)
- [Admin Soft UI contract](../admin-soft-ui-redesign/SPEC.md)
