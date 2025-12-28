# 标签页：层级 URL + Posts/Memos 时间线混排

## 背景与目标

现状标签页路由为 `/tags/[tag]`，为了在单个 path segment 中携带层级标签（如 `Geek/SMS`），页面与组件通过 `encodeURIComponent("Geek/SMS")` 生成 `/tags/Geek%2FSMS`。该路径在生产环境（Tencent EdgeOne/WAF）被判定为高风险并直接拦截为 `HTTP 400`，导致：

- `https://ivanli.cc/memos` 点击标签无法访问；
- 直接访问 `https://ivanli.cc/tags/Geek%2FSMS` 返回 400；
- SEO 与可分享性受影响。

本改动目标：

- 对外暴露“普通层级 URL”：`/tags/Geek/SMS`（无查询参数，SEO 友好）。
- 标签页展示 **文章（post）+ 闪念（memo）**，按时间倒序混排，风格与首页时间线一致。
- 标签语义为“父标签包含子标签内容”，并支持 **加载更多**。

## 范围与非目标

### 范围（In）

- 新的标签详情页路由：`/tags/<segment>/<segment>/...`
- 标签页数据：`post + memo` 混排，按时间倒序
- 标签匹配：命中“当前标签”与其“子标签”（前缀匹配）
- 支持加载更多（分页/无限滚动均可，行为一致）
- 站内所有标签链接统一改为层级 URL（避免 `%2F`）

### 非目标（Out）

- 不使用查询参数承载标签（例如 `?tag=`）
- 不依赖 EdgeOne 放行 `%2F`（即使可配置，也不作为主方案）
- 不改动数据库 schema（`posts.tags` 仍为 JSON 字符串数组）
- 不纳入 `project` 等其它内容类型（本期仅 post + memo）

## 关键用例 / 用户流程

1. 访客在 `/memos` 点击标签 `SMS`（其完整路径为 `Geek/SMS`）
   - 进入 `/tags/Geek/SMS`
   - 看到该标签（含子标签）下的 posts+memos 时间线
   - 下拉/点击“加载更多”继续加载下一页
2. 访客直接访问 `https://ivanli.cc/tags/Geek/SMS`
   - 返回 200（不再 400）
3. 访问父标签 `/tags/Geek`
   - 展示 `Geek/*` 子标签内容（以及可选的 `Geek` 精确标签内容）

## URL 与路由设计

### 对外 URL 规范

- 标签详情页：`/tags/<segment>/<segment>/...`
  - 示例：`/tags/Geek/SMS`、`/tags/DevOps/Network`
- 仅对 **每个 segment** 做 URL 编码（中文/空格等），然后用 `/` 拼回路径。
  - 禁止出现把 `/` 编码为 `%2F` 的写法。

### Next.js 路由

将现有 `src/app/tags/[tag]/` 调整为 catch-all：

- `src/app/tags/[...tagSegments]/page.tsx`
- `src/app/tags/[...tagSegments]/feed.xml/route.ts`（可选：RSS）

参数解析策略：

- `tagSegments: string[]`（每段按需 `decodeURIComponent`，并 `trim()`）
- `tagPath = tagSegments.join("/")`

### 站内链接生成（统一策略）

增加一个小工具函数（位置待实现阶段确定，例如 `src/lib/tag-path.ts`）：

- 输入：`tagPath: string`（如 `Geek/SMS`）
- 输出：`/tags/${segments.map(encodeURIComponent).join("/")}`

用于替换当前所有 `encodeURIComponent(tagPath)` 的写法，避免生成 `%2F`。

## 标签匹配语义（父标签包含子标签）

给定访问路径对应的 `tagPath`：

- 精确命中：`t === tagPath`
- 子标签命中：`t.startsWith(tagPath + "/")`

说明：

- 匹配是大小写敏感（与内容源产出的标签字符串保持一致）。
- 若 `tagPath` 为空（异常），返回 404。

## 数据获取与分页（加载更多）

### 统一时间线数据源

为实现“post+memo 混排 + 稳定分页”，需要一个“统一时间线”查询入口（优先使用 tRPC）：

- 新增 `tags` 路由（例如 `src/server/routers/tags.ts`），并挂到 `appRouter`。
- 提供 `tags.timeline` procedure（命名可在实现阶段微调，但语义不变）。

### `tags.timeline` 输入/输出（形状）

输入（建议）：

- `tagPath: string`（例如 `Geek/SMS`）
- `limit: number`（默认 20，最大 50）
- `cursor?: string`（用于加载更多）

输出（建议）：

- `items: TimelineItem[]`
- `nextCursor?: string`
- `hasMore: boolean`

`TimelineItem` 结构（示意）：

- `type: "post" | "memo"`
- `id: string`
- `slug: string`
- `title?: string`
- `excerpt?: string`（post）
- `content?: string`（memo）
- `publishDate: string`（ISO；用于前端展示与排序）
- `tags: string[]`
- `image?: string`（post）
- `dataSource?: string`

### 排序与 cursor 规则（稳定性）

- 排序：`publishDate DESC, id DESC`
- cursor：沿用现有 memos 分页口径，使用 `(publishDate, id)` 组合游标：
  - `cursor = "${publishDateISO}_${id}"`
  - 下一页条件：`publishDate < cursorDate OR (publishDate = cursorDate AND id < cursorId)`

这样可以保证在同一时间戳下不会跳过/重复。

### 标签过滤（SQL 层面）

`posts.tags` 为 JSON 字符串数组，建议在 SQL 层面做“边界友好”的 LIKE 过滤以减少误匹配：

- 精确：包含 `"${tagPath}"`（带引号边界）
- 子标签：包含 `"${tagPath}/`（同样带引号开头）

并与 `type IN ("post","memo")`、公开性过滤组合。

> 备注：若发现历史数据存在非 JSON 的 tags 格式，再在实现阶段补充兼容分支；本期不做 schema 迁移。

## 页面与组件（统一风格）

### 页面结构

`/tags/<...>` 页面建议结构与 `/memos`、首页保持一致：

- 顶部：标题（显示叶子节点，如 `SMS`），可选面包屑（`Geek / SMS`）
- 主体：时间线列表（复用首页的 `TimelineItem` / 时间线容器）
- 底部：加载更多按钮或自动加载提示

### 列表组件复用

复用现有：

- `src/components/home/TimelineItem.tsx`（单条展示）
- 时间线容器样式（首页 `HomePage` 的 timeline 结构）

标签展示继续复用 `PostTags`，但其 link 生成逻辑必须切换为“segment 编码 + `/` 拼接”。

## SEO 与可选 RSS

### SEO

- canonical：当前层级 URL（`/tags/Geek/SMS`）
- title/description：包含标签叶子节点与必要的上下文信息
- 无结果：返回 404（避免可抓取空页面）

### RSS（可选）

若需要 tag 维度订阅：

- `/tags/<...>/feed.xml`
- 内容口径与页面一致（post+memo + 子标签）

## 兼容性与迁移考虑

- 站内链接全部改为层级 URL 后，正常访问不再触发 EdgeOne 400。
- 旧的 `/tags/<encoded%2F>` 外链在 EdgeOne 侧被 400 拦截，应用侧无法兜底重定向；若未来需要兼容，只能通过 EdgeOne 放行后在应用层做 redirect（本期不做）。

## 风险点与验证要点

- **误匹配风险**：SQL `LIKE` 对 JSON 字符串过滤需带边界（引号）以避免 `Geek/SMS` 误命中 `Geek/SMSPlus`。
- **分页稳定性**：必须统一排序字段与 cursor 规则，避免混排时重复/跳过。
- **数据格式差异**：若存在非 JSON tags，需要在实现阶段补兼容解析与过滤策略。

## 测试要点（实现阶段）

- 单测：tagPath ↔ urlPath 的编码/解码（确保不生成 `%2F`）
- 集成：`tags.timeline` 对 `tagPath` 的“精确 + 子标签”过滤与分页稳定性
- E2E：从 `/memos` 点击标签进入 `/tags/Geek/SMS`，并可加载更多

