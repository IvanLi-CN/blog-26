# History: 公开媒体 assets 门面与内部 source 路由

- Spec ID: `2nvkr`

## 2026-06-10

- 新建规格，固定以下决策：
  - 公开内容源固定为 `local`
  - 公开前台只暴露 blog 自己的 `assets` 门面 URL
  - imagorvideo 通过 blog 内部稳定 source 路由回源
  - 内部 source 路由安全只依赖部署网络边界，不做 TTL / 签名 / header secret
  - 视频本期只做 poster / preview 与受控播放，不做完整转码
  - 公开图片 / GIF / 视频 poster 统一应用 metadata strip、水印与多尺寸策略

## 2026-06-18

- 修正现网部署漂移：`ivanli.cc` 公开前台继续保持静态 `site-dist`，但同源 `/api/public/assets/*` 明确依赖 live backend/gateway，不是静态打包资源。
- 补充生产 fail-fast 门禁：`SERVE_PUBLIC_SITE=true` 时若缺少 `PUBLIC_MEDIA_*` 关键变量，则容器启动直接失败。
- 补充 CI / release smoke：要求验证真实 facade 媒体 URL，不再把 `/api/health` 视为公开媒体链路健康的充分条件。
- 固定 watermark 合同为 blog 自托管静态 SVG 文件 `/watermark-ivanli.svg`；同版 `imagorvideo v1.9.1` 实测确认 SVG 文件 watermark 可用，弃用先前的位图默认方案。
- 明确 watermark 静态文件必须随 `site-dist` 一起发布，并由 blog 同源公开入口直接提供；不允许改成 internal source 或运行时 fallback。
- 按 imagor 官方 filter 合同修正 watermark 参数编码：watermark URL 以 `b64:` base64url 形式写入 filter，避免绝对 URL 中的 `:` 破坏 filter 解析。
- 修正 imagor sidecar readiness 假设：当前 CI 使用的镜像不会返回 `200 /healthz`，因此就绪门禁改为“已开始提供 HTTP 响应”，实际功能由后续 facade 请求与 E2E 断言验证。
- 扩大 E2E 门面覆盖：guest/admin/user/mcp 全矩阵统一挂 imagor sidecar，guest 场景补充真实媒体字节请求与 `/watermark-ivanli.svg` 直连断言。
- 修正 GitHub Actions E2E sidecar 编排：不再在 workflow 里预启动一个固定指向 `host.docker.internal:25090` 的外置 imagor sidecar，而是统一交回 `playwright.config.ts` 管理，使 sidecar internal-source 回源端口始终跟随实际选中的 `WEB_PORT`。
- 修正 release frontend build 校验的样本假设：验证脚本继续检查同源 `assets` 门面、feed 与 watermark 合同，但样本页面改为从实际 `site-dist` 自动发现，避免生产 bundle 不包含 fixture slug 时误判失败。
- 收紧 release feed 校验粒度：每个已生成的 `feed.xml` / `atom.xml` / `feed.json` 都必须单独保留公开 post URL 与同源 facade 资源 URL，避免单个 feed 漏掉 facade 合同却被其它 feed 掩盖。
- 固定门面故障语义：不提供运行时 fallback；imagor/internal source 异常时，公开门面必须直接失败并返回错误。
- 固定浏览器端公开 API base 语义：浏览器运行时优先使用当前页面 `window.location.origin`，以支持同一份预构建前端在多端口隔离 E2E 与同源发布入口下复用；`PUBLIC_API_BASE_URL` 继续作为 SSR / 构建期基线，不引入 runtime fallback。
- 收紧内容媒体路径解码边界：允许 `%20` 等安全 segment 转义继续解码，但显式拒绝 `%2F` / `%5C` 这类编码分隔符、以及会解码成 `.` / `..` 的编码 dot-segment；同时把明文 dot-segment 统一 canonicalize，并拒绝任何越过内容根的 traversal。
- 修正历史内容兼容口径：公开快照、公开 API 和 public-mode Markdown 渲染都会把 legacy `/api/files/<source>/...` 媒体链接重写为同源 `/api/public/assets/...`，并把这类 files-api path 当作内容根相对路径解析；release 使用预下载 `public-snapshot.json` 时不再把旧 `webdav` 路径泄漏进静态 HTML。
