# Implementation: 公开媒体 assets 门面与内部 source 路由

- Spec ID: `2nvkr`
- Status: `implemented`

## 当前实现覆盖

- [x] 统一媒体解析器与稳定 `mediaHash`
- [x] 公开门面路由 `/api/public/assets/:kind/:slug/:mediaHash/:variant.:ext`
- [x] 内部 source 路由 `/_internal/assets/source/:kind/:slug/:mediaHash`
- [x] 公开 `media` 结构化合同
- [x] snapshot / public API / feed / OG / JSON-LD 媒体 URL 去 raw 化
- [x] 公开前台与 `/admin/preview/*` 改用 facade 语义
- [x] 101 `imagorvideo` / `blog` compose 与部署卡片对齐

## 已知基线

- 持久化侧已经通过 `docs/specs/content-relative-paths/SPEC.md` 固定为“相对路径落盘，运行时再映射”。
- 公开侧当前仍主要使用 `/api/files/<source>/...`，包括：
  - snapshot
  - Markdown 渲染链路
  - 前台列表/详情/时间线
  - feed / JSON-LD / OG 相关封面输出
- `/admin/preview/*` 当前直接复用公开内容渲染，但底层媒体解析仍走 raw 文件代理语义。

## 本次实现策略

1. 先新增服务端统一媒体模型与 URL builder，把公开门面合同集中到一处。
2. 再新增公开门面路由与内部 source 路由，确保 facade 可运行。
3. 随后替换 snapshot / API / 页面 / Markdown 公开链路消费方式。
4. 最后补 tests、视觉证据与 101 部署对齐说明。

## 验证门槛

- 单元测试覆盖媒体解析、稳定键、URL 生成与路由参数校验。
- HTTP 兼容测试覆盖：
  - 公开返回不再泄露 `/api/files/*`
  - internal source 路由回源正确
  - facade 路由不重定向
- UI 验证覆盖公开页与 `/admin/preview/*` 的图片/视频展示。

## 已落地实现

1. 新增 `src/lib/public-media.ts` 统一公开媒体类型、稳定 hash、公开 facade path 与内部 source path builder。
2. 新增 `src/server/public-media.ts` 统一解析文章封面、正文图片、正文视频、Memo 附件，并提供：
   - facade 代理路由处理
   - internal source 原文件回源（仅在 `PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL` 已配置时启用）
   - imagor URL 构造与签名
   - 视频 `play` 透传与 `Range` 支持
3. `PublicPostRecord`、`PublicMemoRecord`、`PublicTagTimelineItem` 均升级为带 `media` 结构的公开合同；`local` 内容的旧 `image` / 附件兼容字段已重写为 facade URL，非 `local` 内容继续保留既有公开 URL 语义。
4. 公开 Markdown 渲染链路在 public mode 下改写相对媒体路径，只输出 `/api/public/assets/...`。
5. 公开前台详情页、列表页、feeds、snapshot、JSON-LD、OG/Twitter、tag timeline、`/admin/preview/*` 均已切到 facade 语义。
6. 生产容器启动现在会在 `SERVE_PUBLIC_SITE=true` 时强校验 `PUBLIC_API_BASE_URL`、`PUBLIC_MEDIA_IMAGOR_BASE_URL`、`PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL`，避免把“静态页面正常、公开媒体全挂”的配置发布上线。
7. CI / release frontend build 校验现在显式要求：
   - `PUBLIC_SITE_URL` 与 `PUBLIC_API_BASE_URL` 同源
   - `site-dist` 中真实包含 `/api/public/assets/*` facade 引用
   - release 校验从真实 `site-dist` 自动发现可用的 post/tag/detail/feed 样本，不再把 fixture slug 当成生产 bundle 前提
   - 每个已生成的 feed 文件都必须继续包含公开 post URL 与同源 facade 资源 URL，不允许只校验“任意一个 feed 仍然正确”
   - unified Docker smoke 至少命中 1 个真实 facade 媒体 URL，而不是只看 `/api/health`
8. imagor watermark 已改为 blog 静态 SVG 资源 `/watermark-ivanli.svg`；在 `imagorvideo v1.9.1` 同版实测下，静态 SVG watermark 可用，失败的是内联 `data:` watermark 写法。
9. imagor watermark filter 现在按官方合同将 watermark URL 编成 `b64:` base64url，避免 `http://...` 里的冒号破坏 `filters:` 链。
10. CI sidecar readiness 不再假设 `200 /healthz`；当前镜像只要端口开始返回任意 HTTP 响应，即视为服务已启动，再交给后续 facade / E2E 断言验证实际功能。
11. `site-dist` 现在显式校验并携带 `/watermark-ivanli.svg`；公开网关通过同源静态文件路由直接提供该 watermark 资源，而不是走 internal source。
12. Playwright E2E 的 guest/admin/user/mcp 全矩阵现在都通过 `playwright.config.ts` 统一管理 imagor sidecar，让 sidecar 回源地址始终跟随实际 `WEB_PORT`；仓库默认本地 Playwright 入口与 GitHub Actions 保持同一合同。公开媒体覆盖不再只停留在 `img src` 字符串断言，而会实际请求至少一个 facade 媒体 URL。
13. 公开媒体路径解析只解码安全的 segment 内转义（例如 `%20`），并显式拒绝 `%2F` / `%5C` 这类编码后的路径分隔符，以及任何会在解码后变成 `.` / `..` 的编码 dot-segment；明文 dot-segment 会先 canonicalize，再拒绝任何越过 `LOCAL_CONTENT_BASE_PATH` 内容根的 traversal。
14. 公开内容正文现在会在 snapshot 读取、public API 序列化与 Markdown public-mode 渲染三个入口统一把历史 `/api/files/<source>/...` 链接改写为 `/api/public/assets/...`，并把这类 legacy files-api path 当作内容根相对路径解析。这样 release 使用预下载 `public-snapshot.json` 时也不会再把旧 `webdav` 路径泄漏进 `site-dist`。
15. 正文媒体 rewrite 与服务端索引现在保持同构：除了 Markdown 图片、wiki 图片、`<img>/<video>/<source>`，还显式覆盖指向本地媒体的 Markdown 普通链接与 HTML `<a href>`；任何会被 rewrite 成 facade URL 的正文语法，都必须能通过相同 `mediaHash` 命中 `/_internal/assets/source/...`，不依赖运行时 fallback。
16. 静态页面里 build-time 直接输出的 facade 卡片/头图 URL 现在统一追加 `?v=<public-snapshot.generatedAt>`；release 校验会扫描公开 HTML 中的 `card` / `cover` facade URL，缺少这个稳定版本戳时直接失败，避免“同一路径媒体已恢复，但浏览器和边缘缓存仍钉住旧坏对象”。
17. `/admin/preview/posts/:slug` 与 `/admin/preview/memos/:slug` 现在共享一层后台 Soft UI 详情预览骨架；文章预览借用公开详情页的 hero 层级，Memo 预览则保持与公开 memo 详情页一致的无主图阅读壳，不复用公开 Nature UI 组件或尾部模块。
18. 文章后台预览直接消费现有 preview payload 里的 facade `image` 语义来渲染大主图，修复了内容 frontmatter 已有主图但后台预览缺图的问题。
19. Memo 后台预览明确对齐 `origin/main` 公开基线：保留元信息、标题、标签与正文的详情节奏，但不渲染 hero，也不再承载作者操作条。客户端 `AdminPreviewMemo` 本地契约继续覆盖服务端已返回的 `image` / `media` 能力，以便其它消费面保持类型对齐。
20. Memo 预览明确忽略兼容 payload 中仍可能出现的 `excerpt` 字段；这次只在预览面贯彻“memo 不应有 excerpt”的产品真相，不扩散到 feed、卡片、搜索或 snapshot 的 repo 级清理。
21. Memo 公开详情页、管理员作者态详情壳与 `/admin/preview/memos/:slug` 现在会在外层详情标题已存在时，折叠正文开头与标题同名的首个一级标题，避免同一 memo 在详情阅读面出现两次相同标题。
22. 数据库文章后台预览现在会在读取 `posts.body` 时统一剥离历史 frontmatter 污染，并用结构化字段 / frontmatter 重建标题、摘要、标签与主图；作者态正文区域只显示纯正文，不再把 YAML 泄漏给预览页。
23. 后台文章预览对 `draft: true` 或 `public: false` 改成禁用解释态 CTA，复用既有 preview payload 的 `draft/public` 字段，不新增浏览器可见 API 字段，也不再给作者一个稳定落到公开 404 的链接。
24. 后台预览的 post/memo 本地媒体现在走独立的 `/api/admin/preview/assets/:kind/:slug/:mediaHash/:variant.:ext` 门面，hero 与正文图片不再复用匿名公开 `assets` 权限链路；草稿作者态预览不会因为公开门禁而掉图。
25. 仅后台预览资产门面允许在 imagor 派生处理器不可用时回退原始本地媒体字节，保持作者态可读；匿名公开 `assets` 门面继续维持 `502 Public media processor unavailable` 的 fail-fast 合同。

## 本地开发与故障语义

- 生产模型仍是 `blog -> imagorvideo -> /_internal/assets/source/...`。
- `/_internal/assets/source/...` 只有在 `PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL` 明确指向 blog 内部地址时才会接受请求；未配置时默认返回 `404`，避免误把公开入口当作 internal source。
- 不再提供 dev/prod 运行时 fallback。imagor 链路失败时统一返回 `502 Public media processor unavailable`，由测试、CI 与发布验证显式暴露问题。
- 唯一例外是后台作者态预览资产门面：若 imagor 链路失败，但管理员已通过 `/api/admin/preview/assets/...` 访问本地媒体，则允许回退原始媒体字节，避免预览页出现“正文可读但图片全空白”的作者态故障。

## 101 部署卡片

### blog 环境变量

- `PUBLIC_MEDIA_IMAGOR_BASE_URL=http://imagorvideo:8000`
- `PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL=http://blog:25090`
- 如需签名：
  - `PUBLIC_MEDIA_IMAGOR_SECRET=<same-secret-as-imagor>`
  - `PUBLIC_MEDIA_IMAGOR_SIGNER_TYPE=sha1|sha256|sha512`
  - `PUBLIC_MEDIA_IMAGOR_SIGNER_TRUNCATE=<optional-length>`

### imagorvideo 环境变量

- `HTTP_LOADER_ALLOWED_SOURCES=blog:25090`
- `HTTP_LOADER_BLOCK_PRIVATE_NETWORKS=0`
- `HTTP_LOADER_HTTPS_ONLY=0`
- `IMAGOR_AUTO_WEBP=1`
- `IMAGOR_AUTO_AVIF=1`
- `IMAGOR_AUTO_JPEG=1`
- `VIPS_STRIP_METADATA=1`

### 验证命令

1. `curl -I http://blog:25090/_internal/assets/source/post/<slug>/<mediaHash>`
2. `curl -I http://blog:25090/api/public/assets/post/<slug>/<mediaHash>/cover.webp`
3. `curl -I http://imagorvideo:8000/`
4. `rg -n '/api/files/|/home/|LOCAL_CONTENT_BASE_PATH' site-dist admin-dist site/generated/public-snapshot.json`
5. `curl -I https://ivanli.cc/api/public/assets/post/<slug>/<mediaHash>/cover.webp`
6. `curl -I https://ivanli.cc/watermark-ivanli.svg`

### 回退口径

 - 若 imagorvideo 回源异常，先恢复 `HTTP_LOADER_ALLOWED_SOURCES`、`HTTP_LOADER_BLOCK_PRIVATE_NETWORKS` 与 `HTTP_LOADER_HTTPS_ONLY` 到现网值，再把 blog 的 `PUBLIC_MEDIA_IMAGOR_BASE_URL` 指回旧 imagor 配置。
- 若 blog 内部 source 路由出现异常，保留 facade 代码不回退，优先修正 `LOCAL_CONTENT_BASE_PATH`、容器互通与路由匹配，再重启 `blog` 网关。
