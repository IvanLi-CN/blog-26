# System Share Memos 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 系统分享接收、管理员确认、服务端重分类、幂等恢复、全局发布 Toast、失败重试和详情跳转已实现；发布期间编辑器保持当前内容并切换只读，失败重试不会丢失编辑；手机和桌面五个状态已有视觉证据，恢复修复与跨环境定向验证已通过，当前候选进入最终只读复审和交付门禁收口。
- Lifecycle: active
- Catalog note: 控制台 PWA 接收、浏览器本地待处理槽位、管理员确认、服务端分类与 Memo 写入已落地；Chromium Android/桌面已安装 PWA 的真实系统分享仍待部署环境验收。

## Implementation Coverage

- Requirement coverage: `REQ-SSM-001..002` 由控制台 manifest 和 `public/share-target-sw.js` 覆盖；`REQ-SSM-003..010` 由 IndexedDB 单槽位、确认页和 `src/lib/system-share.ts` 覆盖；`REQ-SSM-011..018` 由专用 multipart API、幂等表、附件暂存和既有剪藏/公开边界覆盖；`REQ-SSM-019` 保持 Chromium-first 兼容声明；`REQ-SSM-020..025` 由 console Toast、稳定提交身份、详情响应、确认页主按钮和 Web Demo 正式路由证据覆盖。
- Confirmation UI contract: 原始分享数据在可展开只读面板中呈现；解析后的内容进入唯一 Memo 内容编辑器，剪藏内容以目标 URL 首行、备注和系统生成的 `#剪藏` 解析标记保留。标题、网址和标签不渲染为独立输入，附件和可见性作为发布控制保留。
- Recovery boundary: SQLite 写事务先校验当前提交租约，并在同一同步临界区内读取、修复和原子发布 Memo 文件；Linux 使用目录文件句柄和 `O_NOFOLLOW` 保护暂存与 Memo 写入，进程退出遗留暂存由下一次请求按租约和年龄清理。生产安全路径要求 Linux；非 Linux 保留路径校验回退以支持开发环境，但不把它作为并发符号链接替换下的安全部署目标。临时写入失败会清理本次文件，重试失败保留过期恢复记录，以便后续成功时清理旧租约附件。成功提示期间保留浏览器槽位，跳转开始时才按提交 ID 清理，刷新仍沿用原身份。
- 定向验证：Agent VM 中执行 `bun test tests/server/system-share-api.test.ts`（35 pass、0 fail、120 expect() calls），本机执行 `bun test src/lib/__tests__/system-share.test.ts`（13 pass、0 fail、18 expect() calls）和 `bun test src/lib/content-sources/__tests__/utils.test.ts`（44 pass、0 fail、55 expect() calls），并通过目标 Biome、`bun run check` 与 `git diff --check`；Agent VM 中的正式 console `/share` Web Demo Playwright 场景移动端与桌面端各 9 passed、0 failed。验证覆盖 Milkdown URL 转义后的剪藏重算、系统生成剪藏标记不进入 frontmatter 标签、编辑刷新、成功提示期间刷新、成功提示 1000ms 停留、失败 Toast 重试、响应丢失回放、详情跳转、槽位替换保护和文件落盘后的索引恢复。
- 构建验证：Agent VM 中以当前候选源码执行 `bun run db:migrations:validate`、`bun run web-demo:build`、`CONSOLE_RUNTIME=true ... bun run console:build`，以及 public export、Astro static build、`verify:public-pwa`、`verify:project-posters` 和 `verify:project-social-previews`，均通过；构建日志仅保留既有 Astro 路由和大 chunk warning。
- VM 全量测试结果：在注入当前候选 renderer commit 后执行 `bun run test` 返回 1065 pass、9 fail、4510 expect() calls。失败集中在仓库级原生搜索模块不可用、发布策略测试缺少同步工作目录中的 Git 元数据、两个公共投影用例超过 5000ms，以及一个启动恢复环境用例；这些与本主题无关的验证前置条件和超时仍未收口，当前结果不构成全量通过。
- VM 浏览器验证：通过 SSH 反向转发访问当前热更新预览，执行同一套 `tests/e2e/web-demo/system-share.spec.ts`，移动端 9 passed、桌面端 9 passed，均 0 failed。覆盖编辑刷新、剪藏单编辑器、成功提示期间刷新、成功提示 1000ms 停留、剪藏转普通闪念、失败 Toast 重试、响应丢失回放、槽位替换保护和访客本地槽位/认证返回；失败 Toast 的移动端布局已验证不会遮挡标题或编辑区，回放断言使用明确的慢场景等待窗口。
- Rollout facts: 控制台 manifest 已注册 `POST /share-target` multipart target，Service Worker 仅在 console runtime 注册；公共 manifest 不含 `share_target`，写入接口按请求运行时拒绝公共站点。

## Coverage / rollout summary

- 现有 Memo 创建、附件、剪藏处理和公开发布边界将作为实现基础。
- 当前公开 PWA 仍是 online-first 静态阅读入口；本主题新增的 Service Worker 仅服务于控制台系统分享 POST。

## Remaining Gaps

- 未在真实已安装 Chromium Android/桌面 PWA 上完成操作系统分享菜单验收；该项需要部署环境和设备行为证据。
- 已从最新构建的正式 console `/share` 路由采集并确认当前候选：390x844 与 1440x1000 均覆盖填充、发布中、成功、失败重试和详情状态，分别保存在 `docs/specs/system-share-memos/assets/system-share-mobile-populated.png`、`system-share-mobile-publishing.png`、`system-share-mobile-success.png`、`system-share-mobile-failure-retry.png`、`system-share-mobile-detail.png`、`system-share-desktop-populated.png`、`system-share-desktop-publishing.png`、`system-share-desktop-success.png`、`system-share-desktop-failure-retry.png` 和 `system-share-desktop-detail.png`；截图显示唯一 Memo 内容框、全局 Toast、实色主按钮、默认私有和返回详情，移动端 Demo 控件避开 Toast 与发布操作，窄屏无横向溢出。手机失败态和桌面发布中、成功、失败态资产已按最新 Toast 间距规则重新采集；运行时发布中记录 Toast 底部约 `50px`、浮标顶部约 `152px`，无 Toast 时浮标位于右上角，不遮挡标题、编辑区或发布操作。
- 生产环境 IndexedDB 配额、存储禁用和跨浏览器降级仍需在经验验收中记录实际结果。
- 先前全量测试与构建曾在本机执行；这不符合重型验证必须使用 Agent VM 的仓库规则，不能作为该门禁的完成证明。当前候选的重型定向测试、E2E 和构建均已在 Agent VM 执行；全量测试仍保留上述环境或无关超时残余。

## Visual Evidence

- 证据源：正式 console Web Demo `/share` 路由，受控管理员 persona；`requested_viewport=390x844` 与 `1440x1000`，`viewport_strategy=devtools-emulate`，页面级证据采用 `trim_only`。
- 状态覆盖：手机与桌面各自覆盖填充确认页、发布中 Toast、发布成功 Toast、失败 Toast 内重试和成功后的 Memo 详情；所有状态均来自同一正式路由和现有 Web Demo Inspector，不新增演示路由。
- 主人已确认当前候选界面；Toast 会根据实际高度动态预留页面顶部空间，并在系统或 Web Demo 减少动画模式下关闭过渡与旋转；真实已安装 Chromium Android/桌面 PWA 的系统分享菜单仍由部署环境经验验收完成。

## Related Changes

- `src/lib/system-share.ts`
- `public/share-target-sw.js`
- `site/components/SystemShareConfirmation.tsx`
- `site/components/SystemShareToast.tsx`
- `site/components/SystemShareToast.css`
- `src/server/public-api/router.ts`
- `src/lib/web-demo-fetch.ts`
- `src/lib/console-web-demo.ts`
- `drizzle/0016_system_share_recovery.sql`

## References

- `./SPEC.md`
- `./HISTORY.md`
