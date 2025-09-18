# RSS 设计与实施方案

作者: Platform Team  
状态: 草案 (v1)  
分支: `feat/rss-research`

## 背景与目标

当前项目已存在一个基础 RSS 路由 `src/app/feed.xml/route.ts`，直接以字符串模板输出 XML。为提升可维护性、兼容性与扩展性（标签订阅、闪念 Memos、JSON Feed/Atom、缓存与测试），本方案在不改变现有数据模型的前提下，抽象统一的 Feed 构建器并逐步扩展多路订阅源。

## 范围

- In scope
  - 主站文章订阅 `/feed.xml`
  - 标签订阅 `/tags/[tag]/feed.xml`
  - 闪念订阅 `/memos/feed.xml`
  - 可选输出：`/atom.xml`、`/feed.json`
  - 缓存：`ETag`、`Last-Modified`、304
  - SEO 可发现性：`<link rel="alternate" ...>`、标签页注入
  - 单测 + E2E
- Out of scope
  - WebSub/Hub 推送、S3 持久化、复杂全文 HTML 渲染（作为第二阶段增强）

## 第三方库评估

- 首选 `feed`：RSS 2.0 / Atom 1.0 / JSON Feed 1.0 生成，TypeScript 友好，维护活跃。
- 备选 `feedsmith`：同时提供解析与生成，支持 RSS/Atom/JSON Feed/RDF 与播客命名空间，适合将来做“聚合/解析”能力。
- 不建议新用 `rss`：经典老库，仅 RSS，近年不活跃。

参考：
- feed: https://www.npmjs.com/package/feed
- feedsmith: https://feedsmith.dev/

结论：第一阶段采用 `feed` 实现生成端；若未来需要解析端或播客命名空间，评估切换/并行引入 `feedsmith`。

## 路由与 URL 设计

- 主订阅
  - RSS: `/feed.xml`
  - Atom: `/atom.xml`（可选）
  - JSON Feed: `/feed.json`（可选）
  - 兼容短链：`/rss.xml` → 301 到 `/feed.xml`
- 标签订阅
  - RSS: `/tags/[tag]/feed.xml`
- 闪念订阅（Memos）
  - RSS: `/memos/feed.xml`

参数：
- `?limit=number`（默认 30，上限 50）

## 数据模型映射

源表：`src/lib/schema.ts` 中 `posts`

- 过滤条件
  - `public = true`
  - `draft = false`（若存在）
  - `publishDate <= now()`
  - Memos: `type = "memo"`
  - 标签订阅: `tags LIKE %tag%`
- 字段映射
  - `title` → `<item><title>`
  - `excerpt`（若无则由 `markdown-utils.extractTextSummary(body)` 生成）→ `<description>`
  - `slug` → 文章链接：`{BASE_URL}/posts/{slug}`；Memos 链接：`{BASE_URL}/memos/{slug}`
  - `publishDate` / `updateDate` → `<pubDate>`（优先 `updateDate` 回退 `publishDate`）
  - `author` / `SITE.author` → `<author>`
  - `category` / `tags[]` → `<category>` 多值
  - `image` / 首图（可选）→ `<enclosure type=image/*>`
  - `guid` → 使用文章永久链接（`isPermaLink=true`）

注意：`publishDate/updateDate` 统一处理秒/毫秒时间戳差异（已有 `toMsTimestamp`）。

## 架构与抽象

新增 `src/lib/rss.ts`：统一封装 Feed 构建与公共工具。

- `buildFeed(meta: FeedMeta, items: FeedItem[]): { rss: string; atom?: string; json?: string }`
  - 内部基于 `feed` 包：`new Feed({...}); feed.addItem(...); feed.rss2()/atom1()/json1()`
  - 负责：
    - 绝对链接拼装（依赖 `NEXT_PUBLIC_SITE_URL`，回退 `http://localhost:25090`）
    - CDATA / 字符转义
    - `description` 取摘要，`content:encoded` 可选（第二阶段，引入 HTML sanitize）
    - `enclosure` 类型推断（基于扩展名，未知则不输出）
    - `feedLinks`（输出多格式时）
- `computeFeedCacheHeaders(items: ItemLike[]): { etag: string; lastModified: string }`
  - `etag`: 对拼接的 `updatedAt|id|link` 列表做 hash（sha1/sha256）
  - `lastModified`: `max(updatedAt|publishedAt)`

可选：`src/lib/http-cache.ts` 放置 304 协商缓存小工具（按需抽离）。

## 实施步骤

Phase 1（基础重构 + 缓存）
1) `bun add feed`
2) 新增 `src/lib/rss.ts` 并完善：`buildFeed`、`computeFeedCacheHeaders`、工具函数
3) 改造 `src/app/feed.xml/route.ts`：
   - 沿用现有查询（公开文章，按 `publishDate`/`updateDate` 降序）
   - 读取 `?limit`（默认 30，上限 50）
   - 使用 `buildFeed` 生成 RSS
   - 设置响应头：
     - `Content-Type: application/xml; charset=utf-8`
     - `Cache-Control: public, s-maxage=3600, stale-while-revalidate=300`
     - `ETag` 与 `Last-Modified`，命中 `If-None-Match` / `If-Modified-Since` 返回 304
4) 新增 `/rss.xml` 路由：301 → `/feed.xml`
5) 在 `README.md` 增加订阅说明（路径、格式、示例）

Phase 2（扩展订阅源）
6) 标签订阅：`src/app/tags/[tag]/feed.xml/route.ts`
   - 查询公开文章，`tags LIKE %tag%`
   - 频道 `<title>` 标注标签名
7) 闪念订阅：`src/app/memos/feed.xml/route.ts`
   - 查询 `posts.type = 'memo'` 且公开
   - 摘要更短（如 120–160 字），可取首张图片做 `enclosure`
8) 可选多格式：
   - `/atom.xml`（Atom）
   - `/feed.json`（JSON Feed）

Phase 3（测试与增强）
9) 单测 `src/lib/__tests__/rss.spec.ts`
   - `buildFeed` 结构、CDATA、`enclosure`、日期与排序、`etag/lastModified`
10) E2E `tests/e2e/rss.spec.ts`
   - 命中 `/feed.xml`、`/tags/<tag>/feed.xml`、`/memos/feed.xml`
   - 校验 200/304、`Content-Type`、根节点、若干 `<item>` 字段
11) 可选：注入 `<content:encoded>`（需 HTML sanitize）与多命名空间（第二阶段评估）

## SEO 与发现

- 已在 `src/app/layout.tsx` 暴露：
  - `<link rel="alternate" type="application/rss+xml" href="/feed.xml" />`
- 标签页（若有单独布局）也注入对应标签订阅 `<link rel="alternate" ...>`
- Sitemap 已存在，RSS 与 Sitemap 互补（无需互相引用）

## 性能与容量

- 单次输出默认 30 条，最大 50 条
- 查询 + 构建目标：冷启动 < 50ms，热路径 < 5ms（本地数据 1k 条级别）
- 通过 `s-maxage` 与 304 降低服务器压力

## 兼容性与回滚

- 生成失败（库异常）时：记录错误并返回 500（保留日志）；可快速回滚到旧的字符串模板实现（保留 git 分支）
- 避免在渲染时做富文本转 HTML（避免 XSS 风险），若启用 `<content:encoded>` 必须 sanitize

## 观测与日志

- 在路由中记录：生成耗时、条目数、命中 304、`etag` 段哈希前 8 位
- 错误：统一前缀 `RSS:` 方便检索

## 开发清单（DoD）

- [ ] `src/lib/rss.ts` 构建器 + 缓存工具
- [ ] `/feed.xml` 改造并支持 304
- [ ] `/rss.xml` 301 重定向
- [ ] `/tags/[tag]/feed.xml`
- [ ] `/memos/feed.xml`
- [ ] （可选）`/atom.xml`、`/feed.json`
- [ ] 单测（构建器）
- [ ] E2E（路由与缓存）
- [ ] 文档与 README 订阅说明

## 代码片段（示例）

```ts
// src/lib/rss.ts（概念示例）
import { Feed } from "feed";
import { SITE } from "@/config/site";

export function buildFeed(meta: {
  title?: string;
  description?: string;
  baseUrl: string;
  selfUrl: string; // 如 https://example.com/feed.xml
}, items: Array<{
  title: string;
  url: string;
  guid?: string;
  description?: string;
  contentHtml?: string; // 可选：作为 content:encoded
  authorName?: string;
  authorEmail?: string;
  categories?: string[];
  image?: { url: string; type?: string };
  date: Date;
}>) {
  const feed = new Feed({
    title: meta.title || SITE.title,
    description: meta.description || SITE.description,
    id: meta.baseUrl,
    link: meta.baseUrl,
    language: "zh-CN",
    image: `${meta.baseUrl}/logo.png`,
    favicon: `${meta.baseUrl}/favicon.ico`,
    updated: new Date(),
    feedLinks: {
      rss: `${meta.baseUrl}/feed.xml`,
    },
    author: {
      name: SITE.author.name,
      email: SITE.author.email,
      link: SITE.url,
    },
  });

  for (const it of items) {
    feed.addItem({
      title: it.title,
      id: it.guid || it.url,
      link: it.url,
      description: it.description,
      content: it.contentHtml, // feed 库会在 RSS 中映射为合适字段
      author: it.authorName || it.authorEmail ? [{
        name: it.authorName,
        email: it.authorEmail,
      }] : undefined,
      category: it.categories?.map((c) => ({ name: c })),
      date: it.date,
      image: it.image?.url,
    });
  }

  return { rss: feed.rss2(), atom: feed.atom1(), json: feed.json1() };
}
```

---

如需调整路线或优先级（例如先只交付 `/feed.xml` 与标签订阅），在本文件开头更新“状态”与“范围”即可。

