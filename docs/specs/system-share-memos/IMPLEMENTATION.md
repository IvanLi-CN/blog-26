# System Share Memos 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 系统分享接收、管理员确认、服务端重分类、幂等恢复、全局发布 Toast、失败重试和详情跳转已实现；发布期间编辑器保持当前内容并切换只读，失败重试不会丢失编辑；移动端紧凑布局、全宽表单承载和附件区域连续触控滚动已实现，并由正式 `/share` Web Demo 的几何与原生触控回归覆盖。真实 Chromium Android 键盘、安全区和手指操作仍待主人设备验收。
- Lifecycle: active
- Catalog note: 控制台 PWA 接收、浏览器本地待处理槽位、管理员确认、服务端分类与 Memo 写入已落地；Chromium Android/桌面已安装 PWA 的真实系统分享仍待部署环境验收。

## Implementation Coverage

- Requirement coverage: `REQ-SSM-001..002` 由控制台 manifest 和 `public/share-target-sw.js` 覆盖；`REQ-SSM-003..010` 由 IndexedDB 单槽位、确认页和 `src/lib/system-share.ts` 覆盖；`REQ-SSM-011..018` 由专用 multipart API、幂等表、附件暂存和既有剪藏/公开边界覆盖；`REQ-SSM-019` 保持 Chromium-first 兼容声明；`REQ-SSM-020..025` 由 console Toast、稳定提交身份、详情响应、确认页主按钮和 Web Demo 正式路由证据覆盖；`REQ-SSM-026..029` 由分享页专用布局样式、键盘视口配置、连续 flex 高度传递、原生文档滚动和定向 Web Demo 回归覆盖。
- Confirmation UI contract: 原始分享数据在可展开只读面板中呈现；解析后的内容进入唯一 Memo 内容编辑器，剪藏内容以目标 URL 首行、备注和系统生成的 `#剪藏` 解析标记保留。标题、网址和标签不渲染为独立输入，附件和可见性作为发布控制保留。
- Mobile confirmation coverage: `REQ-SSM-026..029` 的实现和自动化验收已完成。`VER-SSM-008` 覆盖 `360x740`、`393x852` 首屏与编辑器随可用高度增高，`VER-SSM-009` 覆盖 `320/360/375/393/639px` 以及 `768x1024`、`1440x1000`，`VER-SSM-010` 覆盖 `360x568` 长内容、附件区域 CDP 原生触控滚动和附件增删。长内容、多附件、原始分享数据展开或键盘弹出时采用整页自然滚动，发布区位于表单内容之后；真实软键盘和安全区仍需设备记录。
- Recovery boundary: SQLite 写事务先校验当前提交租约，并在同一同步临界区内读取、修复和原子发布 Memo 文件；Linux 使用目录文件句柄和 `O_NOFOLLOW` 保护暂存与 Memo 写入，进程退出遗留暂存由下一次请求按租约和年龄清理。生产安全路径要求 Linux；非 Linux 保留路径校验回退以支持开发环境，但不把它作为并发符号链接替换下的安全部署目标。临时写入失败会清理本次文件，重试失败保留过期恢复记录，以便后续成功时清理旧租约附件。成功提示期间保留浏览器槽位，跳转开始时才按提交 ID 清理，刷新仍沿用原身份。
- 定向验证：Agent VM 中执行 `bun test tests/server/system-share-api.test.ts`（36 pass、0 fail、123 expect() calls），本机执行 `bun test src/lib/__tests__/system-share.test.ts`（13 pass、0 fail、18 expect() calls）和 `bun test src/lib/content-sources/__tests__/utils.test.ts`（44 pass、0 fail、55 expect() calls），并通过目标 Biome、仓库级 `bun run check` 和 `git diff --check`；检查保留仓库既有的 29 条 warning。Agent VM 中的正式 console `/share` Web Demo Playwright 场景移动端与桌面端各 9 passed、0 failed。验证覆盖 Milkdown URL 转义后的剪藏重算、系统生成剪藏标记不进入 frontmatter 标签、编辑刷新、成功提示期间刷新、成功提示约 1.15 秒停留、失败 Toast 重试、响应丢失回放、详情跳转、槽位替换保护和文件落盘后的索引恢复。
- 移动布局定向验证：正式 console `/share` Web Demo 的 `system-share.spec.ts` 新增场景 3 passed、0 failed，覆盖 `360x740` 与 `393x852` 首屏、编辑器高度分配、`320/360/375/393/639px` 全宽和 `768x1024`、`1440x1000` 宽屏回归，以及 `360x568` 展开原始数据后从附件标题、空态、文件行和控件区域的 CDP 原生触控滚动、双附件增删；`git diff --check` 和变更文件定向 Biome 检查通过。
- 构建验证：当前候选的 `CONSOLE_RUNTIME=true ... bun run console:build` 在本机通过，保留既有 Astro 路由和大 chunk warning。Agent VM 的 `bun run web-demo:build` 未完成：VM 内 `sharp@0.35.4` 的最小 PNG 转换无响应，且 VM 依赖安装在无缓存时无法完成；该阻塞不涉及本次页面代码。Agent VM 仍保留本次候选源码同步和失败命令证据，不能据此宣称 Web Demo 全量构建通过。
- VM 全量测试结果：在注入当前候选 renderer commit 后执行 `bun run test` 返回 1065 pass、9 fail、4510 expect() calls。失败集中在仓库级原生搜索模块不可用、发布策略测试缺少同步工作目录中的 Git 元数据、两个公共投影用例超过 5000ms，以及一个启动恢复环境用例；这些与本主题无关的验证前置条件和超时仍未收口，当前结果不构成全量通过。
- VM 浏览器验证：通过 SSH 反向转发访问当前热更新预览，执行同一套 `tests/e2e/web-demo/system-share.spec.ts`，移动端 9 passed、桌面端 9 passed，均 0 failed。覆盖编辑刷新、剪藏单编辑器、成功提示期间刷新、成功提示约 1.15 秒停留、剪藏转普通闪念、失败 Toast 重试、响应丢失回放、槽位替换保护和访客本地槽位/认证返回；失败 Toast 的移动端布局已验证不会遮挡标题或编辑区，回放断言使用浏览器 DOM 变更时间记录提示显示。
- Rollout facts: 控制台 manifest 已注册 `POST /share-target` multipart target，Service Worker 仅在 console runtime 注册；公共 manifest 不含 `share_target`，写入接口按请求运行时拒绝公共站点。

## Coverage / rollout summary

- 现有 Memo 创建、附件、剪藏处理和公开发布边界将作为实现基础。
- 当前公开 PWA 仍是 online-first 静态阅读入口；本主题新增的 Service Worker 仅服务于控制台系统分享 POST。

## Remaining Gaps

- 真机软键盘、安全区和从附件区域上下滑动的经验验收仍待主人在 Chromium Android 候选上完成；浏览器模拟与 CDP 触控证据不能替代该项。
- 未在真实已安装 Chromium Android/桌面 PWA 上完成操作系统分享菜单验收；该项需要部署环境和设备行为证据。
- 已从最新构建的正式 console `/share` 路由采集并确认当前候选：390x844 与 1440x1000 均覆盖填充、发布中、成功、失败重试和详情状态，分别保存在 `docs/specs/system-share-memos/assets/system-share-mobile-populated.png`、`system-share-mobile-publishing.png`、`system-share-mobile-success.png`、`system-share-mobile-failure-retry.png`、`system-share-mobile-detail.png`、`system-share-desktop-populated.png`、`system-share-desktop-publishing.png`、`system-share-desktop-success.png`、`system-share-desktop-failure-retry.png` 和 `system-share-desktop-detail.png`；截图显示唯一 Memo 内容框、全局 Toast、实色主按钮、默认私有和返回详情，移动端 Demo 控件避开 Toast 与发布操作，窄屏无横向溢出。手机失败态和桌面发布中、成功、失败态资产已按最新 Toast 间距规则重新采集；运行时发布中记录 Toast 底部约 `50px`、浮标顶部约 `152px`，无 Toast 时浮标位于右上角，不遮挡标题、编辑区或发布操作。
- 生产环境 IndexedDB 配额、存储禁用和跨浏览器降级仍需在经验验收中记录实际结果。
- 先前全量测试与构建曾在本机执行；这不符合重型验证必须使用 Agent VM 的仓库规则，不能作为该门禁的完成证明。当前候选的定向浏览器证据在本机正式 Web Demo 预览上通过，Agent VM 已完成源码同步但受 `sharp` 与依赖缓存阻塞，不能宣称重型 Web Demo 构建或全量 E2E 已通过。

## Visual Evidence

- 证据源：正式 console Web Demo `/share` 路由，受控管理员 persona；本次新增 `requested_viewport=360x740`、`393x852` 和 `360x568`，响应式回归另含 `320/375/639px`、`768x1024`、`1440x1000`，`viewport_strategy=devtools-emulate`，页面级证据采用 `trim_only`。
- 状态覆盖：本次候选已采集并提交浅色 360x740 与 393x852 首屏图（`assets/system-share-mobile-layout-360.png`、`assets/system-share-mobile-layout-393.png`），并通过 DOM 几何断言和 CDP 原生触控记录首屏、全宽、内容溢出和附件区域滚动；既有手机与桌面填充、发布中、成功、失败重试和详情状态来自同一正式路由和现有 Web Demo Inspector，不新增演示路由。
- 当前候选截图已获主人确认；真实 Chromium Android 键盘、安全区和手指操作仍作为独立经验验收记录。Toast 会根据实际高度动态预留页面顶部空间，并在系统或 Web Demo 减少动画模式下关闭过渡与旋转。

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
