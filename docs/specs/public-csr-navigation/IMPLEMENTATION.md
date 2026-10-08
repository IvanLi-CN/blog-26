# 公共产品 CSR 导航实现状态

## Current Status

- Implementation: 已实现，验收收敛中
- Lifecycle: active
- 公共页面已迁移到共享 React 渲染器：SSR 或静态首屏提供当前页数据，后续导航读取结构化数据并由客户端渲染。正式产品与 Demo 共用页面和请求状态，Demo 只在数据适配层应用模拟环境。功能与视觉证据已收齐，正式评审与 CI 的交付状态以 PR #175 为准。
- 主线剪藏阅读器与 Memo 类型标记沿用生产组件；当前详情独立携带阅读材料，其他路由不预载剪藏正文。项目 MDX 使用带 JavaScript 后缀的虚拟模块，避免 dev 依赖扫描访问不存在的文件或再次应用 Astro MDX 编译。
- Header 滚动和代码滚动条等会修改页面 DOM 的行为在共享 renderer hydration 后初始化；主题与阅读视口仍在首屏初始化。SSR preview 为原生 Demo fixture 提供完整路径，且只开放结构化页面 GET，其余业务 API 保持阻断。
- 片段历史恢复使用保存的阅读位置；同 URL 的历史项也独立触发恢复。项目 MDX 正文尚未就绪时等待其真实标题与高度，再执行目标锚点或历史定位。Playbook 页面 DTO 不携带独立搜索索引的正文，搜索仍走版本绑定的既有来源。

## Implementation Coverage

| 合同 | 当前事实 | 缺口 |
|---|---|---|
| REQ-PCSR-001 | `PublicRouter` 直接 hydrate 当前路由数据；Demo 与 console 为 SSR，公共静态发布保留首屏 HTML。搜索深链在共享 renderer 加载前保留查询与产品加载界面。 | 首屏功能验证通过。 |
| REQ-PCSR-002、REQ-PCSR-003 | `site/lib/public-route.ts` 与 `site/components/pages/` 共用正式路由和组件。SSR runtime 使用 `/api/public/page`；静态发布使用 `/_content/routes/*.json`。没有目标 HTML 交换或 Demo 专用页面。 | 后续导航、目标失败和原位重试验证通过；待正式评审。 |
| REQ-PCSR-004 | Demo 页面读取经过 `webDemoFetch` 的连接、延迟和取消策略；bootstrap 只携带当前页需要的数据。恢复在线可在失败目标重试，主题不触发页面数据刷新。静态 about 与真实未知路由不制造网络错误。 | 12 类目标的离线与恢复、身份与主题保持验证通过。 |
| REQ-PCSR-005 | URL 先切换；`AbortController` 与代次检查隔离过时读取；历史导航重新读取，保留查询、片段与滚动状态。GET 搜索表单使用相同客户端路由。 | 取消、历史与查询参数验证通过。 |
| REQ-PCSR-006 | 页面结构与 Nature 样式迁移，项目正文共享 React MDX，元信息随目标更新。console 作者界面与公共主机身份剥离继续沿用既有接口规则。Inspector 几何未改动。 | 五张桌面和移动端截图已确认并保存；完整移动与对比度矩阵通过。 |

## Verification

候选基线为 `973d788309e23f98cf836f2b607d22e2cb53a3b2`。保留主线剪藏阅读器、类型标记及 Playbook 面向访客的文案简化；以下验证覆盖共享页面实现。

- Agent VM 预提交套件通过，包含组件 Story 边界、构建隔离、路由匹配、公开接口、请求取消及未访问正文的载荷隔离。命令：`bun run test:precommit`，提交 hook 保持启用。Playbook 搜索正文隔离另有回归断言。
- Demo 导航：`tests/e2e/web-demo/public-csr.spec.ts` 16 项全部通过，覆盖 SSR 离线首屏、12 类离线目标及恢复、历史、主题、取消、静态页面和 404，并断言没有 hydration 错误。命令：`WEB_DEMO_TEST_URL=<demo-origin> bun x playwright test --config tests/e2e/web-demo/playwright.config.ts`。
- 正式静态站：`tests/e2e/guest/public-csr-navigation.spec.ts` 6 项通过，覆盖结构化导航、目标错误与原位重试、搜索参数、hydration 交接、直接入口及跨页片段历史滚动、延迟 MDX 正文的锚点定位。console 的首屏与主题、窄屏交互及作者隔离测试通过；共享 CSR 回归覆盖相同正式页面。
- console 作者界面与公共主机隔离：同步后的 `tests/e2e/admin/public-csr-authoring.spec.ts` 通过。CSR 请求保留 `private, no-store`，管理员看到私密记录，公共主机即使携带身份也不能得到这些记录。测试身份使用 runtime 配置的 `ADMIN_EMAIL`，无代理鉴权捷径。
- 剪藏 Demo 的独立 E2E 脚本通过：正式详情链接使用 CSR，原文／译文、讨论、保存、重试、焦点与草稿、网络与身份及 7 种宽度均验证；除页面 DTO 外没有真实 API 或模型请求。
- 公共页面的正文、代码块、浅深色和系统主题，以及 320、360、375、393、640、1024px 内容流通过。完整逐节点三帧对比度矩阵通过，AA 门槛保持 4.5。两项完整矩阵分别以独立输出目录复测；此前失败原因均为整体预算耗尽。阅读矩阵预算为 600 秒，实际约 8.3 分钟；对比度预算为 720 秒，独立运行约 6.1 分钟，采样与断言没有减少。
- live、console、Demo 三种 Astro 制品构建通过。新 CSR 文件的类型诊断已清除；全仓库 TypeScript 检查仍有原有后台与测试错误，以及未改动的 `site/lib/feeds.ts` 可空标题问题，不记录为全仓库类型通过。
- `bun run check` 通过，保留迁移前样式与原生媒体带来的警告；Spec 结构和 owner-facing 图片文档检查通过。
- 制品检查逐一读取 125 个静态 JSON 的 HTTP 响应，包含 92 个原生标签路径；全部匹配构建载荷。125 份 live HTML 不包含 Demo 启用标记；Demo 离线 SSR 仍含当前文章正文，console 列表 DTO 不携带文章详情正文。
- 本地 `web-demo:site` dev server 使用独立缓存和端口租约；项目 MDX 的临时修改及恢复均自动更新，开发工具栏通过本地 Astro 偏好关闭，未修改产品布局。
- 六方向只读评审发现的片段时序、历史滚动与 Playbook 搜索载荷问题按原合同修复，并增加对应回归。主线 Playbook 的文案同步保留正式产品实现；本 PR 不调整站点导航的图标展示规则。
- Playbook 的“全部／主题／项目实践／规则”入口按分类栏实际可用宽度显示已有图标：达到 344px 时显示，较窄时保留完整文字；操作高度保持 44px。320、360、393、1440px 视口均无横向溢出，393px 浅深色及键盘导航验证通过。更新后的 Playbook 移动端截图已由主人确认，其余四张证据不变。

## Remaining Gaps

- PR #175 的当前评审与检查记录是交付门禁的事实来源。本任务尚未获得合并授权。

## References

- [Requirements](./SPEC.md)
- [Topic history](./HISTORY.md)
