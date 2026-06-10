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

- 持久化侧已经通过 `docs/plan/0002:content-relative-paths/PLAN.md` 固定为“相对路径落盘，运行时再映射”。
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

## 本地开发回退

- 生产模型仍是 `blog -> imagorvideo -> /_internal/assets/source/...`。
- `/_internal/assets/source/...` 只有在 `PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL` 明确指向 blog 内部地址时才会接受请求；未配置时默认返回 `404`，避免误把公开入口当作 internal source。
- 本地未部署 imagorvideo 时，`handlePublicAssetFacadeRequest` 在非 production 环境允许对图片走 dev-only source fallback，便于本地视觉验证不被外部服务阻断。
- 该 fallback 只用于开发期 proof，不改变生产期 metadata strip / watermark / modern formats 的真实交付路径。

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
- `HTTP_LOADER_HTTPS_ONLY=0`
- `IMAGOR_AUTO_WEBP=1`
- `IMAGOR_AUTO_AVIF=1`
- `IMAGOR_AUTO_JPEG=1`
- `VIPS_STRIP_METADATA=1`

### 验证命令

1. `curl -I http://blog:25090/_internal/assets/source/post/<slug>/<mediaHash>`
2. `curl -I http://blog:25090/api/public/assets/post/<slug>/<mediaHash>/cover.webp`
3. `curl -I http://imagorvideo:8000/healthz`
4. `rg -n '/api/files/|/home/|LOCAL_CONTENT_BASE_PATH' site-dist admin-dist site/generated/public-snapshot.json`

### 回退口径

- 若 imagorvideo 回源异常，先恢复 `HTTP_LOADER_ALLOWED_SOURCES` 与 `HTTP_LOADER_HTTPS_ONLY` 到现网值，再把 blog 的 `PUBLIC_MEDIA_IMAGOR_BASE_URL` 指回旧 imagor 配置。
- 若 blog 内部 source 路由出现异常，保留 facade 代码不回退，优先修正 `LOCAL_CONTENT_BASE_PATH`、容器互通与路由匹配，再重启 `blog` 网关。
