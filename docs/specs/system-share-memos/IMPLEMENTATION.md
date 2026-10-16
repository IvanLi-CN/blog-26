# System Share Memos 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 系统分享接收、管理员确认、服务端重分类、幂等恢复、全局发布 Toast、失败重试和详情跳转已实现；发布期间编辑器保持当前内容并切换只读，失败重试不会丢失编辑；当前候选视觉证据已覆盖手机和桌面五个状态，正在进行修复后的正式复审
- Lifecycle: active
- Catalog note: 控制台 PWA 接收、浏览器本地待处理槽位、管理员确认、服务端分类与 Memo 写入已落地；Chromium Android/桌面已安装 PWA 的真实系统分享仍待部署环境验收。

## Implementation Coverage

- Requirement coverage: `REQ-SSM-001..002` 由控制台 manifest 和 `public/share-target-sw.js` 覆盖；`REQ-SSM-003..010` 由 IndexedDB 单槽位、确认页和 `src/lib/system-share.ts` 覆盖；`REQ-SSM-011..018` 由专用 multipart API、幂等表、附件暂存和既有剪藏/公开边界覆盖；`REQ-SSM-019` 保持 Chromium-first 兼容声明；`REQ-SSM-020..025` 由 console Toast、稳定提交身份、详情响应、确认页主按钮和 Web Demo 正式路由证据覆盖。
- Confirmation UI contract: 原始分享数据在可展开只读面板中呈现；解析后的内容进入唯一 Memo 内容编辑器，剪藏内容以目标 URL 首行、备注和系统生成的 `#剪藏` 解析标记保留。标题、网址和标签不渲染为独立输入，附件和可见性作为发布控制保留。
- Verification commands: `bun run test`（1137 pass, 63 skip, 0 fail, 4974 expect() calls）; `bun test src/lib/__tests__/system-share.test.ts tests/server/system-share-api.test.ts tests/lib/web-demo-inspector-layout.test.ts`（38 pass）; `bun test src/components/memos/__tests__/MilkdownEditor.test.tsx`（19 pass）; `bun test --isolate tests/lib/public-pwa-assets.test.ts`（5 pass）; `WEB_DEMO_TEST_URL=http://127.0.0.1:35430 WEB_DEMO_VIEWPORT=desktop bunx playwright test --config tests/e2e/web-demo/playwright.config.ts tests/e2e/web-demo/system-share.spec.ts`（6 pass）; `bun run db:migrations:validate`; `bun run check`; `bun run backend:dist`; `CONSOLE_RUNTIME=true PUBLIC_SITE_URL=https://console.ivanli.cc PUBLIC_SITE_BASE_PATH= bun run console:build`; `DB_PATH=./dev-data/web-demo/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/web-demo/local CONTENT_SOURCES=local PUBLIC_SNAPSHOT_PATH=./dev-data/web-demo/public-snapshot.json bun run site:build`; `bun run web-demo:build`; 以及 `git diff --check`。
- Rollout facts: 控制台 manifest 已注册 `POST /share-target` multipart target，Service Worker 仅在 console runtime 注册；公共 manifest 不含 `share_target`，写入接口按请求运行时拒绝公共站点。

## Coverage / rollout summary

- 现有 Memo 创建、附件、剪藏处理和公开发布边界将作为实现基础。
- 当前公开 PWA 仍是 online-first 静态阅读入口；本主题新增的 Service Worker 仅服务于控制台系统分享 POST。

## Remaining Gaps

- 未在真实已安装 Chromium Android/桌面 PWA 上完成操作系统分享菜单验收；该项需要部署环境和设备行为证据。
- 已从最新构建的正式 console `/share` 路由采集并确认当前候选：390x844 与 1440x1000 均覆盖填充、发布中、成功、失败重试和详情状态，分别保存在 `docs/specs/system-share-memos/assets/system-share-mobile-populated.png`、`system-share-mobile-publishing.png`、`system-share-mobile-success.png`、`system-share-mobile-failure-retry.png`、`system-share-mobile-detail.png`、`system-share-desktop-populated.png`、`system-share-desktop-publishing.png`、`system-share-desktop-success.png`、`system-share-desktop-failure-retry.png` 和 `system-share-desktop-detail.png`；截图显示唯一 Memo 内容框、全局 Toast、实色主按钮、默认私有和返回详情，移动端 Demo 控件避开 Toast 与发布操作，窄屏无横向溢出。
- 生产环境 IndexedDB 配额、存储禁用和跨浏览器降级仍需在经验验收中记录实际结果。
- Agent VM 已完成健康检查和资源分配，但来宾没有 `bun`、`node` 或 `npm`，因此重型命令使用本机项目运行时完成；该环境限制已记录，不影响本次本机验证结果。

## Visual Evidence

- 证据源：正式 console Web Demo `/share` 路由，受控管理员 persona；`requested_viewport=390x844` 与 `1440x1000`，`viewport_strategy=devtools-emulate`，页面级证据采用 `trim_only`。
- 状态覆盖：手机与桌面各自覆盖填充确认页、发布中 Toast、发布成功 Toast、失败 Toast 内重试和成功后的 Memo 详情；所有状态均来自同一正式路由和现有 Web Demo Inspector，不新增演示路由。
- 主人已确认当前候选界面；真实已安装 Chromium Android/桌面 PWA 的系统分享菜单仍由部署环境经验验收完成。

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
