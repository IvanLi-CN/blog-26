# 公共产品 CSR 导航实现状态

## Current Status

- Implementation: 已实现，验收收敛中
- Lifecycle: active
- 公共页面已迁移到共享 React 渲染器：SSR 或静态首屏提供当前页数据，后续导航读取结构化数据并由客户端渲染。正式产品与 Demo 共用页面和请求状态，Demo 只在数据适配层应用模拟环境。PR 仍处于 Draft；视觉确认与正式评审尚未完成。

## Implementation Coverage

| 合同 | 当前事实 | 缺口 |
|---|---|---|
| REQ-PCSR-001 | `PublicRouter` 直接 hydrate 当前路由数据；Demo 与 console 为 SSR，公共静态发布保留首屏 HTML。搜索深链在共享 renderer 加载前保留查询与产品加载界面。 | 首屏功能验证通过。 |
| REQ-PCSR-002、REQ-PCSR-003 | `site/lib/public-route.ts` 与 `site/components/pages/` 共用正式路由和组件。SSR runtime 使用 `/api/public/page`；静态发布使用 `/_content/routes/*.json`。没有目标 HTML 交换或 Demo 专用页面。 | 后续导航、目标失败和原位重试验证通过；待正式评审。 |
| REQ-PCSR-004 | Demo 页面读取经过 `webDemoFetch` 的连接、延迟和取消策略；bootstrap 只携带当前页需要的数据。恢复在线可在失败目标重试，主题不触发页面数据刷新。静态 about 与真实未知路由不制造网络错误。 | 12 类目标的离线与恢复、身份与主题保持验证通过。 |
| REQ-PCSR-005 | URL 先切换；`AbortController` 与代次检查隔离过时读取；历史导航重新读取，保留查询、片段与滚动状态。GET 搜索表单使用相同客户端路由。 | 取消、历史与查询参数验证通过。 |
| REQ-PCSR-006 | 页面结构与 Nature 样式迁移，项目正文共享 React MDX，元信息随目标更新。console 作者界面与公共主机身份剥离继续沿用既有接口规则。Inspector 几何未改动。 | 桌面和移动布局、正文、主题和完整对比度矩阵验证通过；视觉确认待完成。 |

## Verification

以下结果来自同步主线前的候选。主线新增的剪藏阅读器与类型标记已接入共享 renderer，剪藏详情载荷限制为当前记录；同步后候选正在重新构建与验证，尚不能以这些结果宣告当前版本完成。

- Agent VM 预提交套件：857 项通过，包含组件 Story 边界、构建隔离、路由匹配、公开接口和请求取消。命令：`bun run test:precommit`。
- Demo 导航：`tests/e2e/web-demo/public-csr.spec.ts` 的 16 项场景通过（15 项批量运行，取消场景随后独立复测）。覆盖 SSR 离线首屏、12 类离线目标及恢复、历史、主题、取消、静态页面和 404。命令：`WEB_DEMO_TEST_URL=<demo-origin> bun x playwright test --config tests/e2e/web-demo/playwright.config.ts`。
- 正式静态站：`tests/e2e/guest/public-csr-navigation.spec.ts` 的 4 项通过，覆盖结构化导航、目标错误与原位重试、搜索参数及 hydration 交接。console 的这 4 项及共享 renderer 的首屏主题测试也全部通过。
- console 作者界面与公共主机隔离：`tests/e2e/admin/public-csr-authoring.spec.ts` 通过。CSR 请求保留 `private, no-store`，管理员看到私密记录，公共主机即使携带身份也不能得到这些记录。
- 公共页面原有正文、代码块、浅深色主题、系统主题响应，以及 320、360、375、393、640、1024px 内容流矩阵通过。完整逐节点、三帧对比度矩阵通过；采样保持原 AA 门槛，VM 运行预算为 600 秒。
- live、console、Demo 三种 Astro 制品构建通过。新 CSR 文件的类型诊断已清除；全仓库 TypeScript 检查仍有原有后台与测试错误，以及未改动的 `site/lib/feeds.ts` 可空标题问题，不记录为全仓库类型通过。
- `bun run check` 通过，保留迁移前样式与原生媒体带来的警告；Spec 结构和 owner-facing 图片文档检查通过。
- 制品检查逐一读取 125 个静态 JSON 的 HTTP 响应，包含 92 个原生标签路径；全部匹配构建载荷。125 份 live HTML 不包含 Demo 启用标记；Demo 离线 SSR 仍含当前文章正文，console 列表 DTO 不携带文章详情正文。

## Remaining Gaps

- 展示桌面与移动端 Web Demo 证据；在主人确认后保存为本主题 canonical 资产。
- 完成同步主线后的回归验证，包括剪藏详情 CSR 导航、阅读与模拟权限；随后完成当前候选的正式只读评审、PR 更新与 CI 收敛，再申请移出 Draft。本任务尚未获得合并授权。

## References

- [Requirements](./SPEC.md)
- [Topic history](./HISTORY.md)
