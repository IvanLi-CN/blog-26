# Style Playbook集成

## Context and Scope

本主题定义博客原生展示 Style Playbook、上游稳定发布后自动更新静态站，以及 console 跟随已发布Playbook快照的长期契约。

范围包括上游公开目录中的 Topic、项目实践快照和 Policy Skill、它们的正文与关系、博客导航及搜索、版本化数据发布、console 缓存与失败处理。上游知识内容的管理与写入、私有内容和未进入公开目录的分组/读写 Skill 主文档由上游负责；文章与 Memo 的实时读取边界由既有主题负责。

博客主导航与栏目标题均使用两字名称“执念”，项目集合与搜索类型显示为“项目实践”。

## Terms and Interfaces

领域术语见 [CONTEXT.md](../../../CONTEXT.md)。上游知识源为 `IvanLi-CN/style-playbook-skills`；博客成功部署决定 console 跟随的已发布Playbook快照。

| 路径 | 阅读内容 |
| --- | --- |
| `/playbook/` | Playbook入口、目录概览与内容版本 |
| `/playbook/topics/` | Topic 索引与分类 |
| `/playbook/topics/<slug>/` | Topic 正文、关联项目实践与 Policy Skill |
| `/playbook/projects/` | 公开项目实践索引 |
| `/playbook/projects/<slug>/` | 项目实践正文与关联 Topic |
| `/playbook/policies/` | 公开 Policy Skill 索引 |
| `/playbook/policies/<slug>/` | Policy Skill 指令、公开资源与安装指南 |
| `/search` | 文章、Memo 和Playbook的统一搜索入口 |

数据接口包括上游固定 Release 的公开数据包、博客部署指针、不可变版本数据和 console 本地缓存。指针建议位于 `/_content/playbook/manifest.json`，版本文件建议位于 `/_content/playbook/<release-tag>/<digest>/`；具体文件布局必须遵循下述身份与缓存契约。

公开包与部署 edition 的固定格式见 [公开包契约](./contracts/public-package.md)。跨仓触发的参与方、接口、输入、凭据、补漏与结果处理见 [Release 触发契约](./contracts/release-trigger.md)。

```mermaid
flowchart LR
  U[上游稳定 Release] --> E[公开导出与版本校验]
  E --> A[版本化公开数据包]
  A --> W[博客内容更新 workflow]
  B[已发布博客渲染器] --> W
  P[文章与 Memo 公开快照] --> W
  W --> S[Astro 构建并校验]
  S --> D[EdgeOne 静态页面与 JSON]
  D --> C[console 后台同步]
  C --> L[本地最后成功快照]
  L --> R[console SSR 与Playbook搜索]
```

## Requirements

### REQ-PBI-001 — 原生阅读集合

博客必须继承 [Nature UI 响应式契约](../nature-front-ui/SPEC.md#44-responsive-control-and-code-density)，复用自身布局、导航、阅读样式、目录、移动布局和深色主题，完整展示公开目录中的 Topic、项目实践快照和 Policy Skill。每个对象必须能从索引进入正文，保留关联与 section anchor，并展示采用的内容版本。Playbook身份与文章、Memo、博客标签和现有项目案例必须独立；Policy Skill 阅读或复制命令不得自动执行安装。入口分类选择器（“全部 / 主题 / 项目实践 / 规则”）的悬浮、焦点和触控反馈不得移动交互元素自身的命中框；视觉状态只能改变颜色、背景或阴影等不影响命中边界的属性，需要抬升时位移必须作用于不参与命中的内部视觉层，并保持每个入口至少 44px 的可用高度。公开静态页禁用 JavaScript 时必须仍有完整正文和导航，console 首次响应必须提供 SSR 正文。

桌面详情页的 Hero 必须横跨正文与目录两栏。目录必须位于正文旁的侧栏，复用主题原生卡片，标题采用辅助导航层级，并在顶部导航下方随滚动固定；目录宽度不得挤占正文的正常阅读空间，锚点跳转后的章节标题不得被顶栏遮住。640–1023px 的目录放在正文前，使用与正文一致的主题卡片底色、边框、圆角和阴影，不得直接落在环境背景上。小于 640px 的移动端目录直接放在正文前，复用全宽、平面的阅读承载层，不使用独立卡片、圆角、边框或阴影，并保留无 JavaScript 导航能力。目录必须呈现正文真实标题层级，保留标题原文及已有编号，不自动添加章节编号。正文前目录的主章节条目采用 32px 纵向步距，子标题使用缩进、辅助色与 24px 步距，每个主章节组之间留 4px 间距。移动端目录标题配合目录图标，子标题通过细分支线连接到所属章节；当前项采用文字强调与细下划线，避免整行填色呈现为菜单按钮。悬浮菜单使用独立的 36px 触控间距。启用 JavaScript 时，正文前目录、桌面目录与悬浮目录同步强调当前阅读标题及其父章节；展开悬浮目录时定位并聚焦当前条目。子标题锚点必须在静态 HTML 和 SSR 中可用，且与目录一一对应。目录区完全滑出屏幕顶部后，右下角出现纵向的“目录 / 回到顶部”按钮组，距屏幕边框至少 16px，并考虑安全区域。按钮组从屏幕顶部中间沿弧线进入，组本体轻微收稳；悬浮目录使用紧凑菜单样式，从按钮组向左上展开，宽度随内容适配，最小 200px、最大不超出视口边距，长目录可内部滚动。再次显示正文前的目录区时收起按钮组。浮层支持锚点跳转、关闭按钮、外部点击和 Escape，减少动态效果时使用短淡入淡出。

### REQ-PBI-002 — 公开数据边界

Policy Skill 的公开文本文件必须能在页面内直接查看，预览区由可关闭、可重新展开的文件树与文件窗口组成。资源区标题右侧提供放大显示按钮，启用 JavaScript 后将同一工作区放入铺满当前视口的模态阅读层，使用主题底色、平面边界及移动安全区边距；文件、阅读/源码模式与有效滚动位置继续保留。放大期间背景不可操作且锁定页面滚动，支持按钮与 Escape 退出并返回原按钮焦点，恢复页面位置与原尺寸；移动文件树开启时，Escape 优先收起文件树。无 JavaScript 时不显示放大按钮，原生文件阅读仍可用。公开资源位于正文之后的独立分区，自占一行。桌面端使用主题卡片，横跨正文与目录两栏，与详情 Hero 同宽；移动端复用全宽、平面的阅读承载层，贴合视口两边，内容按共享阅读边距内缩，不使用外层卡片圆角、边框或阴影。文件树、工具栏与文件窗口共用资源分区底色，不额外叠加明暗背景，仅通过细分隔线与选中状态区分。文件树保留真实相对目录和文件名，切换文件后保持目录展开状态；关闭文件树后窗口使用可用全宽。启用 JavaScript 时，浏览器使用具有上下限的稳定视口高度，切换长短文件、阅读/源码模式和文件树显隐不得改变整体高度。文件树、Markdown 阅读区和源码分别内部滚动，工具栏与预览方式固定在文件窗口顶部；阅读与源码滚动区支持键盘操作。移动端文件树使用预览区内的非模态浮层，不参与上下布局，不挤压预览空间；浮层使用主题底色和适度阴影，宽高限制在工作区内，文件列表独立滚动。浏览器地址栏变化不得引起工作区持续伸缩。禁用 JavaScript 时保留原生折叠项的自然文档高度。代码、配置与 Markdown 源码采用博客现有明暗主题语法高亮，未知文本格式显示原文。Markdown 提供受控阅读与源码切换。阅读模式将文件开头完整的 YAML frontmatter 解析为独立键值元数据，仅将正文交给 Markdown renderer；兼容 JSON 形式的 YAML 元数据、BOM 和 CRLF。错误或不支持的元数据保留原文供查看，不执行自定义 YAML 标签；源码与下载始终保留完整文件。文件之间的相对链接只能映射到同一 Skill 已公开的文件；所有文件提供同版本匿名下载。移动端文件树默认收起，从窗口工具栏下方自然浮出；选择文件、点击浮层外部或按 Escape 后收起，关闭按钮与 Escape 将焦点返回工具栏，重新展开时聚焦当前文件。非模态浮层不锁定页面滚动或使用对话框焦点陷阱，减少动态效果偏好禁用动画；展开时仅滚动文件树以显示当前选择，保持页面阅读位置与预览高度。跨越 640px 工作区宽度时切换浮层与桌面侧栏；文件选择、目录折叠与预览方式等触控目标至少为 44px。静态 HTML 与 console SSR 必须包含文件内容，禁用 JavaScript 时仍能通过原生折叠项查看；页面内预览不得执行脚本、HTML 或 Mermaid。

页面、JSON 与搜索只能消费上游经过可见性和内容检查的公开导出，必须排除私有项目、内部字段、生成记录、管理数据及凭据。项目的 `visibility` 字段必须明确存在且为 `public` 或 `null`；缺失值和未知值一律拒绝。不得用原始仓库 Markdown 扫描或内部 API 绕过公开导出；公开契约缺失或检查失败时必须拒绝发布。正文必须按数据使用受控 Markdown renderer，不得执行包内脚本或 MDX。公开安装指南所引用的资源和依赖必须匿名可用；上游读取凭据只能留在 CI。

### REQ-PBI-003 — 固定来源与包身份

自动发布只能采用非 draft、非 prerelease 的稳定 Release，并固定仓库身份、Release ID/tag、tag 解析后的源 commit 和包 digest。首次引导与补漏可枚举稳定 Release，按 SemVer 选择最高的就绪版本；选中后，构建必须固定该 Release 的身份并校验 manifest、tag commit 和包 digest。不得下载浮动的 `latest` URL，也不得以当前分支导出冒充旧 tag。接收端必须重新核对触发参数、Release 元数据与资产；同一 Release 的既有资产 digest 不一致时必须拒绝静默替换。

### REQ-PBI-004 — 稳定发布自动更新

博客内容 workflow 每小时检查一次上游稳定 Release；发布资产齐全且通过校验后，自动选择最高的就绪稳定 SemVer 并构建、部署。`PLAYBOOK_INTEGRATION_ENABLED` 是应用集成与定时内容更新的唯一启用开关；未设置或为 false 时暂停自动更新，普通应用发布必须失败关闭以免丢失当前 Playbook，显式回滚要求同一开关为 false。首次应用发布在没有已部署指针时也使用相同的选择逻辑。博客使用已发布的稳定前端渲染器和明确身份的文章/Memo 公开快照。未经应用发布门禁的最新 `main` 不得自动作为渲染器。人工可默认执行 `mode=reconcile`，也可提交固定来源身份进行 `mode=release` 重试；两种入口复用相同的来源校验和部署流程。上游无需跨仓调用博客 Actions API。

### REQ-PBI-005 — 内容与应用发布分离

纯Playbook内容刷新必须独立于应用 SemVer、应用 GitHub Release 和 console 镜像构建。Playbook输入必须独立于依赖 console 的 posts/memos `public-snapshot.json`，Playbook构建不得反过来依赖 console 的Playbook缓存。普通前端代码发布必须保留当前采用的Playbook版本并检查兼容性；首次路由和缓存能力上线通过正常应用发布完成。

### REQ-PBI-006 — 并发与乱序

内容更新、显式回滚与应用代码发布必须共享生产部署互斥边界，在途部署不得因新触发被中断。应用发布必须从开始 EdgeOne 静态站点部署前一直持有互斥，直至依赖同一批 Playbook 指针的 console 镜像与后端发布步骤完成，避免内容更新在静态站点与 console 产物之间插入。重复事件必须幂等；迟到事件和代码发布不得把生产内容静默降级。自动更新只能采用更高的稳定版本；显式回滚只能指定低于当前部署版本的稳定 Release，并在构建完成、部署前再次确认目标仍早于当前指针。发布前必须重新核对候选与当前部署身份。

### REQ-PBI-007 — 同批发布与版本资产

Playbook页面、目录、详情、搜索数据和当前指针必须来自同一次成功部署，记录上游版本、包 digest、博客渲染器 commit 与文章/Memo 快照身份。版本文件必须使用不可变缓存，当前指针必须使用短缓存或重新验证。部署必须保留尚可被上一批指针引用的版本文件，并保留原始发布包供回滚；不得假定替换整站后旧目录仍可访问。

### REQ-PBI-008 — console 跟随已部署版本

console 必须后台同步博客的公开 JSON，在网络健康且 schema 兼容时约五分钟内跟随成功部署的数据。console 必须先读取指针，再下载该确切版本，并完成来源、schema、digest 与记录关系校验后整体替换缓存。并发刷新必须只保留一个任务；目录、详情和搜索不得分批生效。SSR 必须使用已验证的本地快照，不得逐页面请求访问 GitHub、上游服务或未部署的上游版本。

### REQ-PBI-009 — 最后成功版本与首次启动

上游或博客的下载、构建、校验和部署失败时，静态站必须继续提供之前成功发布的版本。console 必须持久化最后成功快照，网络故障、重启或新 schema 不兼容时继续使用最后兼容版本。没有持久缓存时可使用兼容的初始公开快照；有可用缓存时不得被初始快照覆盖。没有任何可用快照时，Playbook必须显示暂不可用，不得以空目录冒充成功，也不得阻止其他 console 功能启动。

### REQ-PBI-010 — 统一搜索与版本一致性

统一搜索必须明确区分 Topic、项目实践、Policy Skill、文章和 Memo，提供正确的目标 URL 与类型过滤。Playbook搜索必须使用确定性全文索引，向量化不得成为发布前置条件；不同来源的分数不得直接混排，结果应按来源分组。静态站使用本批构建的Playbook索引，console 使用已采用缓存中的同批索引；上游路由与 section anchor 必须映射至Playbook命名空间，文章/Memo 原有检索与授权规则必须保留。

### REQ-PBI-011 — 发布可追溯与回滚

部署记录必须保存 `(blogRendererCommit, playbookRelease, bundleDigest, contentSnapshotIdentity)`、实际发布结果及失败原因。重试、定时补漏和显式旧版回滚必须可核对到确切输入；回滚目标必须是低于当前部署版本的稳定 Release，并检查渲染器兼容性后整体恢复页面与公开数据。两个阅读站点必须能核对各自采用的内容版本，包括 console 暂留旧版的情况。

## Verification

### VER-PBI-001

- Method: 对完整公开目录检查原生索引、正文、关系和 anchor；检查移动/深色页面、禁用 JavaScript 的静态 HTML 及首次 console SSR；在分类选择器底边固定指针的浏览器场景中检查四个入口不发生 `pointerleave`/重复进入，也不发生命中框位移。
- covers: `REQ-PBI-001`
- Pass condition: 所有可见对象可读且身份独立，版本可见，阅读或复制安装命令没有执行副作用；四个分类入口的命中框在悬浮反馈期间保持稳定。

### VER-PBI-002

- Method: 使用含私有项目、缺失或未知可见性、内部字段和执行内容的导出样例检查公开输出与拒绝路径；检查匿名安装资源和凭据边界；以长短文本、长路径及阅读/源码切换核对 1280、390、320 宽度的预览高度、内部滚动、文件树显隐与无 JavaScript 原生折叠阅读；检查移动端阅读区域贴合视口、无外层卡片框架、文本边距和 44px 触控目标，以及文件树默认收起、浮层不改变预览几何尺寸、选择/外部点击/Escape 收起和焦点返回。
- covers: `REQ-PBI-002`
- Pass condition: 非公开数据不进入 HTML、JSON 或搜索，公开检查失败拒绝发布，包内代码不执行且访客无需源仓库凭据。

### VER-PBI-003

- Method: 检查稳定、draft、prerelease、错误来源、tag/commit 不符、文件损坏和同版本不同 digest 的包与事件。
- covers: `REQ-PBI-003`
- Pass condition: 仅确切且完整的稳定版本可被采用，下载固定输入，所有不符输入均被拒绝。

### VER-PBI-004

- Method: 检查上游成功数据发布、漏通知后的补漏及手动重试，核对渲染器和两类内容输入。
- covers: `REQ-PBI-004`
- Pass condition: 合法发布触发同一更新入口，输出来自固定数据和已发布渲染器；产物未就绪时不更新生产。

### VER-PBI-005

- Method: 对比内容刷新与正常代码发布的副作用和依赖图。
- covers: `REQ-PBI-005`
- Pass condition: 内容刷新不发布应用版本或镜像，Playbook输入无循环依赖；代码发布保留已采用内容并校验兼容性。

### VER-PBI-006

- Method: 注入重复、乱序和并发代码/内容发布事件，核对发布前状态及显式回滚。
- covers: `REQ-PBI-006`
- Pass condition: 完整应用发布、内容更新和回滚使用同一不可中断的生产锁；该锁覆盖 EdgeOne 部署至 console 产物发布全程，任务排队不丢失；重复输入无额外更新，迟到任务不降级；显式回滚只接受早于当前部署的稳定版本，且指针在构建后变化时必须重新验证。

### VER-PBI-007

- Method: 对照单批页面、JSON、索引与指针，检查缓存头及整站更新后的旧指针下载。
- covers: `REQ-PBI-007`
- Pass condition: 所有内容身份一致，旧指针仍可取到引用文件，不可变文件与当前指针使用各自缓存策略。

### VER-PBI-008

- Method: 模拟新指针、分批下载、校验失败和并发刷新，检查更新延迟与页面请求的外部调用。
- covers: `REQ-PBI-008`
- Pass condition: 健康兼容情况下约五分钟内整体切换；失败或未完成下载不切换，SSR 无请求级上游依赖。

### VER-PBI-009

- Method: 模拟上游/博客各阶段失败、console 重启、断网、不兼容 schema、有旧缓存和无任何快照的首次启动。
- covers: `REQ-PBI-009`
- Pass condition: 已发布静态站与最后兼容缓存持续可用；初始快照不覆盖缓存；无快照时仅Playbook暂不可用。

### VER-PBI-010

- Method: 检查每种Playbook对象与 anchor 的搜索结果、类型过滤、来源分组、刷新期间的索引身份和文章/Memo 授权样例。
- covers: `REQ-PBI-010`
- Pass condition: 两站Playbook检索对应各自采用版本，URL 正确且不碰撞项目案例，已有授权边界保留，无向量服务仍可检索。

### VER-PBI-011

- Method: 核对成功/失败记录、重试、补漏和兼容/不兼容回滚，比较页面标示版本与实际数据身份。
- covers: `REQ-PBI-011`
- Pass condition: 每次结果可追溯到确切输入，回滚整体且兼容，console 保留旧版时版本标示仍真实。

## Related ADRs

- [ADR 0010](../../adr/0010-self-contained-console-runtime.md)
- [ADR 0011](../../adr/0011-published-playbook-read-model.md)

## References

- [实现状态](./IMPLEMENTATION.md)
- [研究基线与主题历史](./HISTORY.md)
- [Release 触发契约](./contracts/release-trigger.md)
- [应用发布契约](../manual-version-release/SPEC.md)
- [既有搜索契约](../search-full-text-fallback/SPEC.md)


## Visual Evidence

页面级证据使用 Web Demo 构建物的正式 `/playbook/` 与 `/search` 路由，导航与栏目标题为“执念”，项目分类为“项目实践”。Web Demo 在构建时注入固定公开 Playbook 包和公开快照；它不依赖登录、真实来源访问或 Storybook 页面 Story。每个 Web Demo 正式路由都带有共享 Inspector，可切换场景、身份、网络、数据模式，执行刷新/模拟保存/重置，并复制包含 `d_*` 状态的当前路由 URL；模拟写入只保存在内存中。Storybook 只保留资源浏览器和搜索组件状态的交互覆盖。下方既有图片是迁移前的历史视觉记录，重新捕获当前证据时必须以 Web Demo 为源，并在证据记录中标明正式路由和构建产物。

| 场景 | 浅色 | 深色 |
| --- | --- | --- |
| 移动端阅读，390 × 844 | ![移动端浅色阅读](./assets/playbook-mobile-light.png) | ![移动端深色 Policy 阅读](./assets/playbook-mobile-dark.png) |
| 桌面端阅读，1280 × 900 | ![桌面端浅色阅读](./assets/playbook-desktop-light.png) | ![桌面端深色阅读](./assets/playbook-desktop-dark.png) |
| 搜索，390 × 844 / 1280 × 900 | ![移动端 Policy 筛选](./assets/playbook-search-mobile.png) | ![桌面端 Policy 筛选](./assets/playbook-search-desktop.png) |
| 平板端目录与正文，768 × 900 | ![平板端浅色目录卡片](./assets/playbook-tablet-contents-light.png) | ![平板端深色目录卡片](./assets/playbook-tablet-contents-dark.png) |

索引采用“全部 / 主题 / 项目实践 / 规则”分类选择器。桌面端以独立卡片展示，移动端使用连续阅读列表；类型图标位于标题左侧，内容不使用时间线。该索引展示已由 owner 确认。

![桌面端深色索引，类型图标位于标题左侧](./assets/playbook-card-title-icons-desktop-dark.png)

768 × 900 平板目录与正文使用同一主题面板背景、边框、圆角、阴影及可用宽度；浅色和深色场景均由 owner 确认。

公开资源浏览器位于正文后的独立全宽区域。桌面端在同一表面内并列显示文件树与预览；移动端文件树作为预览上的浮层按需打开。资源卡片支持铺满视口查看。

![移动端深色公开资源浏览器，文件树以浮层打开](./assets/playbook-resource-mobile-dark.png)

![桌面端浅色公开资源浏览器，文件树与预览并列](./assets/playbook-resource-desktop-light.png)
