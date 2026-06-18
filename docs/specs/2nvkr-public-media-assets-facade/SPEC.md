# SPEC: 公开媒体 assets 门面与内部 source 路由

- Spec ID: `2nvkr`
- Status: `active`
- Owner: `main-agent`

## 1. 背景

当前公开前台的内容源媒体仍直接暴露运行时文件代理语义：

- 公开页面、snapshot、feed、JSON-LD、OG/Twitter 仍会返回相对路径或 `/api/files/*` URL。
- 前台可推断原始文件布局，匿名用户也能直接请求 raw 文件代理地址。
- 图片/GIF/视频缺少统一的隐私清洗、尺寸约束、多尺寸派生与博客水印策略。

仓库已经在 `docs/plan/0002:content-relative-paths/PLAN.md` 固定了“持久化内容只保存规范化相对路径”的不变量。本规格承接该约束：持久化继续保持相对路径，公开站点只暴露 blog 自己的稳定 `assets` 门面 URL，由后端在返回公开数据时完成媒体 URL 转换。

## 2. 目标

1. 公开前台、公开 API、snapshot、feed、OG/Twitter、JSON-LD、前台预览统一只暴露 blog 域名下的 `assets` 门面 URL。
2. `imagorvideo` 通过 blog 内部稳定 source 路由回源原始媒体，前台与匿名用户看不到 raw 文件路径、宿主文件路径或 `/api/files/*`。
3. 公开 `post` / `memo` 数据增加统一结构化 `media` 视图，并把旧 `image` / 附件字符串兼容字段改写为门面 URL。
4. 统一覆盖文章封面、正文内联媒体、Memo 附件、tag timeline 代表图，以及详情页视频播放引用。
5. 公开派生结果应用统一的现代格式、多尺寸、不放大、水印与 metadata strip 策略。

## 3. 非目标

- 不引入完整视频转码、HLS、多码率、自适应 streaming。
- 不把 `/projects`、评论头像、站点 icon、装饰性静态资源纳入本媒体管线。
- 不回写 Markdown、数据库或内容源文件中的媒体 URL；持久化仍然只保存相对路径。
- 不为其他内容源设计公开媒体分支；本规格内的 content source 固定为 `local`。

## 4. 范围

### In scope

- `post` / `memo` 公开内容的媒体解析、稳定键计算、门面 URL 生成与公开响应序列化。
- `GET /api/public/assets/:kind/:slug/:mediaHash/:variant.:ext` 公开门面路由。
- `GET /_internal/assets/source/:kind/:slug/:mediaHash` 内部稳定回源路由。
- 公开详情页、列表页、timeline、feed、OG/Twitter、JSON-LD、public snapshot、`/admin/preview/*` 的媒体消费方式。
- 101 上 `imagorvideo` 与 `blog` 的 compose / 部署卡片对齐说明。

### Out of scope

- 编辑器内嵌 preview、后台文件树、上传回显、作者态 raw 读取链路。
- 远程 authoring / 迁移逻辑。
- 内容文件命名、存储目录、同步流程、上传落盘策略。

## 5. 顶层约束

### 5.1 Content source

- 本规格中的公开内容源固定为 `local`。
- `posts`、`memos`、tag timeline 是公开内容类型，不是 source 维度。

### 5.2 公开门面 URL

- 公开媒体唯一允许暴露的 URL 形状固定为：
  - `GET /api/public/assets/:kind/:slug/:mediaHash/:variant.:ext`
- `kind` 只允许 `post | memo`。
- `variant` 固定为：
  - `card`
  - `cover`
  - `content`
  - `full`
  - `social`
  - `poster`
  - `play`
- `mediaHash` 基于“规范化相对媒体路径 + 内容角色”计算，要求对同一内容文件稳定。
- 公开门面必须代理 `imagorvideo` 或内部 raw 播放响应，不得 302 跳转到第三方或内网域名。

### 5.3 内部 source 路由

- 内部稳定回源 URL 固定为：
  - `GET /_internal/assets/source/:kind/:slug/:mediaHash`
- 该路由根据 `kind + slug` 读取公开内容记录，再按统一媒体解析器重建候选媒体集合并匹配 `mediaHash`。
- 命中后从 `LOCAL_CONTENT_BASE_PATH` 读取原始文件并返回正确的 MIME、长度、`Last-Modified` 与 `Range` 支持。
- 该路由不出现在任何公开响应、公开文档或前台链接中。
- 权限模型固定为“只依赖部署/容器网络边界”，不做 TTL、不做签名、不做共享 header secret。

### 5.4 公开媒体安全与隐私

- 任何公开返回不得出现：
  - 相对路径
  - 宿主文件路径
  - `/api/files/*`
  - raw 原图 URL
  - raw 原视频 URL
- 公开图片、GIF 派生帧、视频 poster 必须 strip metadata / EXIF。
- 图片宽 `<240`、高 `<160`、或面积 `<80000px` 时跳过水印；其他公开派生图默认加右下角 `ivanli.cc` 透明文本水印。

### 5.5 内容媒体路径规范化

- 内容文件里的本地媒体路径只允许解码安全的 segment 内转义（例如 `%20`）。
- 编码后的路径分隔符 `%2F` / `%5C` 一律视为非法输入。
- 任何会在解码后变成 `.` 或 `..` 的编码 dot-segment（例如 `%2E`、`%2E%2E`、`.%2E`）一律视为非法输入。
- 解析器必须对明文 `.` / `..` segment 做 canonicalize，但只允许结果停留在 `LOCAL_CONTENT_BASE_PATH` 内容根内；任何会越过内容根的 traversal 都必须直接拒绝。
- 这组规则属于公开媒体合同本身，不允许通过运行时 fallback 容忍或绕过。

## 6. 公开数据合同

### 6.1 统一 `media` 视图

以下公开数据结构都必须增加统一 `media` 视图对象：

- `PublicPostRecord`
- `PublicMemoRecord`
- `PublicTagTimelineItem`
- `api/public/posts`
- `api/public/memos`
- `api/public/tags/timeline`

`media` 至少包含：

- `kind`
- `alt`
- `variants`
- `poster`
- `playback`
- `sources`

兼容字段约束：

- 旧 `image` 字段可暂时保留，但值必须是对应公开门面 URL。
- 旧附件路径字符串若继续对外保留，也必须改写为对应公开门面 URL。

### 6.2 媒体角色

统一媒体解析器需要区分至少这些角色：

- `cover`: 文章或 Memo 首图/封面
- `content`: 正文内联图片/GIF/视频
- `attachment`: Memo 附件
- `playback`: 详情页内联视频播放目标

`mediaHash` 必须把“规范化相对媒体路径 + 内容角色”都纳入稳定键输入，避免同一路径在不同公开语义下冲突。

## 7. 派生规则

### 7.1 图片 / GIF

- 静态图片默认输出矩阵：`AVIF -> WebP -> JPEG/PNG fallback`。
- `GIF`：
  - `card` / `cover` / `social` 冻结首帧为静态图。
  - `content` / `full` 保留动画并优先使用现代格式；若现网镜像实测不支持，则保留兼容 fallback。
- 所有图片变体禁止 upsize。

### 7.2 视频

- 本期不转码整段视频。
- 视频只生成 `poster` / preview 图。
- `play` 变体用于详情页与前台预览中的受控原视频播放，仍通过 blog 自己的 `assets` 门面 URL 提供。

### 7.3 usage -> variant 约束

- `card`: 列表卡片
- `cover`: 详情页头图
- `content`: 正文内联
- `full`: 灯箱/高分辨率查看
- `social`: 分享卡
- `poster`: 视频封面
- `play`: 视频播放

## 8. imagorvideo 对接约束

- 101 上 `imagorvideo` 从“公网 HTTPS allowlist 源”切到“blog 容器内网内部 source 路由”。
- 现网配置需支持：
  - `HTTP_LOADER_ALLOWED_SOURCES`
  - `HTTP_LOADER_ALLOWED_SOURCE_REGEXP`（如需要）
  - `HTTP_LOADER_HTTPS_ONLY=0`（内部 HTTP 回源模型）
  - `HTTP_LOADER_BLOCK_PRIVATE_NETWORKS=0`（允许 imagorvideo 回源 `blog:25090` 这类容器内网地址）
  - `IMAGOR_AUTO_WEBP=1`
  - `IMAGOR_AUTO_AVIF=1`（官方文档标注 experimental）
  - `IMAGOR_AUTO_JPEG=1`
  - `VIPS_STRIP_METADATA=1`
- 水印使用 imagor `watermark(...)` filter，且 watermark image 固定回源 blog 自己提供的静态 SVG 文件（例如 `/watermark-ivanli.svg`）；禁止使用内联 `data:` URL watermark。视频 poster 使用 `frame(...)` filter。
- `/watermark-ivanli.svg` 必须作为公开静态产物随 `site-dist` 一起落盘，并由 blog 同源公开入口直接提供；不得依赖独立对象存储、运行时生成、或 internal source 路由来承接 watermark 文件。
- 公开媒体链路不允许运行时 fallback；`imagorvideo` 不可用、配置错误、或 internal source 回源失败时，门面必须直接返回错误，由部署/监控暴露故障。
- blog 服务需要知道 imagor 的访问基址与签名配置，才能生成代理请求 URL；前台不可见 imagor 真实地址。

## 9. 验收标准

1. 公开 HTML、snapshot JSON、`/api/public/*`、feed、OG/Twitter、JSON-LD 中不再出现相对路径、宿主路径、`/api/files/*` 或 raw 媒体 URL。
2. 公开内容媒体统一改为 `assets` 门面 URL，覆盖文章封面、正文内联媒体、Memo 附件、timeline 代表图、视频 poster 与详情页视频播放 URL。
3. `GET /api/public/assets/:kind/:slug/:mediaHash/:variant.:ext` 始终代理处理结果，不重定向到 imagor 域名。
4. `GET /_internal/assets/source/:kind/:slug/:mediaHash` 能稳定回源，并支持 `Range`。
5. `/admin/preview/*` 与真实公开页使用同一套公开媒体语义；编辑器内嵌 preview/raw authoring 语义保持不变。
6. 小图不加水印；公开派生结果不带敏感 metadata。
7. 101 上 `imagorvideo` / `blog` 所需 compose 与部署卡片改动、验证命令与回退说明具备可执行口径。
8. 公开入口可直接返回 `/watermark-ivanli.svg`，且 E2E / smoke 覆盖至少有一条真实请求命中该文件与一个 `/api/public/assets/*` 媒体 URL。
9. 公开媒体路径解析会拒绝编码 separator、编码 dot-segment 与越过内容根的 traversal；这类输入不得被解析成可访问文件路径。

## Visual Evidence

- Public posts list facade rendering: [public-posts-list.png](/Users/ivan/.codex/worktrees/563a/blog-25/docs/specs/2nvkr-public-media-assets-facade/assets/public-posts-list.png)
- Public post detail facade rendering: [public-post-detail.png](/Users/ivan/.codex/worktrees/563a/blog-25/docs/specs/2nvkr-public-media-assets-facade/assets/public-post-detail.png)
- Admin preview uses the same facade semantics: [admin-preview-post.png](/Users/ivan/.codex/worktrees/563a/blog-25/docs/specs/2nvkr-public-media-assets-facade/assets/admin-preview-post.png)

## 10. 参考

- [docs/plan/0002:content-relative-paths/PLAN.md](../../plan/0002:content-relative-paths/PLAN.md)
- `src/public-site/snapshot.ts`
- `src/server/public-api/router.ts`
- `src/server/files-api/router.ts`
- `src/components/common/markdown/plugins/rehype-image-optimization.ts`
- `site/pages/posts/[slug].astro`
- `site/pages/memos/[slug].astro`
