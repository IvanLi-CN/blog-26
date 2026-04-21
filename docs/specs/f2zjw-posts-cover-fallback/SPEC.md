# SPEC: `/posts` 首图封面回退

- Spec ID: `f2zjw`
- Status: `已完成`
- Owner: `main-agent`

## 1. 背景

当前 `/posts` 页面只会在 `post.image` 存在时渲染封面图。
真实线上公开数据里，大部分文章没有 `frontmatter.image`，但正文中已经包含可复用的首图，因此列表页退化成纯文本卡片，未能恢复设计预期的左图右文两栏布局。

## 2. 目标

1. `/posts` 列表在缺少 `frontmatter.image` 时，回退使用文章正文第一张图片作为封面。
2. 封面解析顺序固定为：`frontmatter.image` → `metadata.images[]` → 第一张 Markdown 图片 → 第一张 wiki 图片。
3. `/posts` 列表允许外链图片作为封面来源。
4. `RelatedPostCard` 复用同一套候选封面解析逻辑，但继续屏蔽外链图。

## 3. 非目标

- 不回填数据库或 `PublicSnapshot.image` 字段。
- 不改变详情页、Feed、SEO、首页时间线或标签时间线的封面语义。
- 不修改线上 Markdown 内容源。

## 4. 实现约束

- 新增一个共享封面 helper，统一处理 `./`、相对路径、Obsidian `。/` 与 wiki 图片目标规范化。
- `PostCard` 使用共享 helper 获取封面候选，并保留现有本地/远端资源解析方式。
- `RelatedPostCard` 继续优先本地 data URL，并维持外链屏蔽行为。

## 5. 验收标准

1. `/posts` 中至少一篇“无 `frontmatter.image`、但正文有首图”的文章必须显示封面图。
2. 没有任何图片来源的文章继续保持无图文本卡片。
3. 纯 helper 测试覆盖封面优先级、外链开关、wiki 图片规范化。
4. 访客 E2E 覆盖 `/posts` 卡片媒体列出现的回归场景。

## 6. Visual Evidence

`/posts` 列表卡片现在会在缺少 `frontmatter.image` 时回退渲染正文首图，恢复左图右文布局。

![`/posts` 首图封面回退验证](./assets/posts-cover-fallback-sk150c.png)

## 7. 验证

- `bun run check`
- `bun test src/lib/__tests__/post-cover.test.ts`
- `WEB_PORT=30120 bunx playwright test tests/e2e/guest/posts-cover-fallback.spec.ts --project=guest-chromium`
- 使用真实线上公开数据重建 `site-dist`，并在 `http://127.0.0.1:30020/posts/` 复查封面是否出现
