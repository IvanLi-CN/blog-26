# System Share Memos 实现状态

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实。

## Current Status

- Implementation: 系统分享接收、管理员确认、服务端重分类、幂等恢复、全局发布 Toast、失败重试和详情跳转已实现；候选视觉证据已采集，等待主人确认后进入交付
- Lifecycle: active
- Catalog note: 控制台 PWA 接收、浏览器本地待处理槽位、管理员确认、服务端分类与 Memo 写入已落地；Chromium Android/桌面已安装 PWA 的真实系统分享仍待部署环境验收。

## Implementation Coverage

- Requirement coverage: `REQ-SSM-001..002` 由控制台 manifest 和 `public/share-target-sw.js` 覆盖；`REQ-SSM-003..010` 由 IndexedDB 单槽位、确认页和 `src/lib/system-share.ts` 覆盖；`REQ-SSM-011..018` 由专用 multipart API、幂等表、附件暂存和既有剪藏/公开边界覆盖；`REQ-SSM-019` 保持 Chromium-first 兼容声明；`REQ-SSM-020..025` 由 console Toast、稳定提交身份、详情响应、确认页主按钮和 Web Demo 正式路由证据覆盖。
- Confirmation UI contract: 原始分享数据在可展开只读面板中呈现；解析后的内容进入唯一 Memo 内容编辑器，剪藏内容以目标 URL 首行、备注和系统生成的 `#剪藏` 解析标记保留。标题、网址和标签不渲染为独立输入，附件和可见性作为发布控制保留。
- Verification commands: `bun run test`（1116 pass, 63 skip）; `bun test --isolate tests/lib/public-pwa-assets.test.ts src/lib/__tests__/system-share.test.ts`; `WEB_DEMO_TEST_URL=http://127.0.0.1:50200 bunx playwright test --config tests/e2e/web-demo/playwright.config.ts tests/e2e/web-demo/system-share.spec.ts`; `bun run db:migrations:validate`; `bun run backend:dist`; `CONSOLE_RUNTIME=true PUBLIC_SITE_URL=https://console.ivanli.cc PUBLIC_SITE_BASE_PATH= bun run console:build`; `DB_PATH=./dev-data/web-demo/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/web-demo/local CONTENT_SOURCES=local PUBLIC_SNAPSHOT_PATH=./dev-data/web-demo/public-snapshot.json bun run site:build`; `bun run web-demo:build`; targeted Biome and `git diff --check`。
- Rollout facts: 控制台 manifest 已注册 `POST /share-target` multipart target，Service Worker 仅在 console runtime 注册；公共 manifest 不含 `share_target`，写入接口按请求运行时拒绝公共站点。

## Coverage / rollout summary

- 现有 Memo 创建、附件、剪藏处理和公开发布边界将作为实现基础。
- 当前公开 PWA 仍是 online-first 静态阅读入口；本主题新增的 Service Worker 仅服务于控制台系统分享 POST。

## Remaining Gaps

- 未在真实已安装 Chromium Android/桌面 PWA 上完成操作系统分享菜单验收；该项需要部署环境和设备行为证据。
- 已从最新构建的正式 console `/share` 路由采集确认状态：390x844 使用 [/Users/ivan/.codex/user-inline-assets/blog-26__a6e9e0b9/2026/10/16/20261016T043832Z-system-share-mobile-footer-layout-final-fb2b6ca8.png](/Users/ivan/.codex/user-inline-assets/blog-26__a6e9e0b9/2026/10/16/20261016T043832Z-system-share-mobile-footer-layout-final-fb2b6ca8.png)，1440x1000 使用 [/Users/ivan/.codex/user-inline-assets/blog-26__a6e9e0b9/2026/10/16/20261016T043832Z-system-share-desktop-footer-layout-final-3d253486.png](/Users/ivan/.codex/user-inline-assets/blog-26__a6e9e0b9/2026/10/16/20261016T043832Z-system-share-desktop-footer-layout-final-3d253486.png)；两张图都只在唯一 Memo 内容框中显示 URL 首行、分享备注和 `#剪藏`，底部可见性与发布操作在同一操作行，窄屏无横向溢出。
- 生产环境 IndexedDB 配额、存储禁用和跨浏览器降级仍需在经验验收中记录实际结果。

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
