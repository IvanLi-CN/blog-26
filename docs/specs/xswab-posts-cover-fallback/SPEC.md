# `/posts` 列表正文首图封面回退（#xswab）

## 状态

- Status: 已完成
- Created: 2026-04-21
- Last: 2026-04-21

## 背景 / 问题陈述

- 生产环境的 Astro `/posts` 列表卡片只读取 `post.image`，而现有公开文章大多没有 `frontmatter.image`。
- 这些文章的正文里通常已经有首图，但列表页没有回退逻辑，导致桌面端卡片退化成无图的单列文本布局。
- 不修复的话，正文已有视觉内容的文章仍无法在列表页展示封面，和当前 Nature 卡片设计不一致。

## 目标 / 非目标

### Goals

- 在 `/posts` 卡片层支持正文首图封面回退，并恢复桌面端左图右文布局。
- 保持封面优先级稳定：`frontmatter.image` → `metadata.images[]` → 第一张 Markdown 图片 → 第一张 wiki 图片。
- 允许 `/posts` 列表把外链图片作为回退封面。
- 为该行为补稳定测试与视觉证据。

### Non-goals

- 不回填数据库或内容源里的 `image` 字段。
- 不改变 feed、SEO、详情页的封面来源语义。
- 不扩展到首页时间线、标签时间线、搜索结果或其他卡片。

## 范围（Scope）

### In scope

- Astro 公共列表卡片的封面回退 helper。
- `/posts` 列表卡片使用正文首图回退。
- `RelatedPostCard` 复用解析逻辑但保持当前“外链不显示”的行为。
- 稳定测试夹具、单测、访客 E2E、视觉证据和 spec 同步。

### Out of scope

- 内容同步流程、数据库 schema、`PublicSnapshot` schema。
- 任何生产内容文件的批量修复。
- 其他公共页面的封面策略扩 scope。

## 需求（Requirements）

### MUST

- `/posts` 的 `PostCard` 必须在 `post.image` 为空时回退到正文第一张图片。
- 正文首图支持 Markdown 图片与 Obsidian wiki 图片，且需要统一路径规范化。
- `/posts` 允许外链封面；`RelatedPostCard` 不允许外链封面。
- 新增测试夹具必须稳定复现“`image` 为空但正文首图存在”的场景。

### SHOULD

- 复用一套 Astro 侧共享 helper，避免封面提取逻辑再次分叉。
- 保持现有无封面卡片的全宽文本表现不变。

### COULD

- 在后续任务中把同一 helper 扩展到其他公共卡片，但本 spec 不要求这样做。

## 功能与行为规格（Functional/Behavior Spec）

### Core flows

- 当 `frontmatter.image` 或 `metadata.images[]` 存在时，`/posts` 继续优先展示这些封面。
- 当两者都为空时，`/posts` 从正文中提取第一张 Markdown 图片；若没有 Markdown 图片，再提取第一张 wiki 图片。
- 当提取到的是本地相对路径图片时，继续通过现有 `/api/files/<source>/...` 解析显示。
- 当提取到的是外链图片时，`/posts` 直接把外链作为卡片封面展示。
- `RelatedPostCard` 只复用候选提取与路径规范化，本地图片继续优先转 data URL，外链仍然不显示。
- 当正文第一张 Markdown 图片是外链、但后续存在本地 wiki 图片时，`RelatedPostCard` 继续跳过这张外链 Markdown 图，并允许后续 wiki 图片补位。

### Edge cases / errors

- `image: ""`、空白字符串或无效 `metadata.images[]` 必须被视为“无封面”。
- wiki 图片路径中的 `。/`、`.。/` 和 `|caption` 片段必须被规范化。
- Markdown 图片目的地中的可选 title 片段不能被并入最终封面 URL。
- 没有任何可用图片时，卡片必须维持现有无图布局。

## 接口契约（Interfaces & Contracts）

### 接口清单（Inventory）

None

## 验收标准（Acceptance Criteria）

- Given 一篇公开文章的 `frontmatter.image` 为空，正文第一张图为本地相对路径图片
  When 访客打开 `/posts`
  Then 对应卡片显示左侧封面图，且标题/摘要位于图片右侧。

- Given 一篇公开文章存在 `frontmatter.image`
  When 访客打开 `/posts`
  Then 卡片仍优先使用 `frontmatter.image`，不会被正文首图覆盖。

- Given `RelatedPostCard` 命中正文首图为外链图片
  When 相关文章卡片渲染
  Then 它继续保持无封面，而不是显示外链图。

- Given 新增的封面回退测试夹具
  When 运行公共快照导出、Astro 构建、helper 单测和访客 E2E
  Then 所有相关验证通过，且回退行为被稳定覆盖。

## 实现前置条件（Definition of Ready / Preconditions）

- 封面优先级与外链策略已锁定。
- `/posts` 的变更边界限定在卡片层，不涉及快照 schema。
- 测试夹具与视觉证据路径已确定。

## 非功能性验收 / 质量门槛（Quality Gates）

### Testing

- `bun run public:export`
- `bun run site:build`
- `bun test src/lib/__tests__/post-cover.test.ts`
- `bunx playwright test tests/e2e/guest/astro-front-phase1.spec.ts --project=guest-chromium --grep "falls back to the first body image"`

### UI / Storybook (if applicable)

- Stories to add/update: None
- Docs pages / state galleries to add/update: None
- `play` / interaction coverage to add/update: None
- Visual regression baseline changes (if any): `/posts` 列表视觉证据刷新

### Quality checks

- 保持变更文件通过 Biome / TypeScript / Playwright 既有约束

## 文档更新（Docs to Update）

- `docs/specs/xswab-posts-cover-fallback/SPEC.md`: 记录范围、验证与视觉证据
- `docs/specs/README.md`: 新增索引项并同步状态

## 计划资产（Plan assets）

- Directory: `docs/specs/xswab-posts-cover-fallback/assets/`
- In-plan references: `![...](./assets/<file>.png)`
- Visual evidence source: maintain `## Visual Evidence` in this spec when owner-facing or PR-facing screenshots are needed.

## Visual Evidence

桌面端 `/posts` 现在会在缺少 `frontmatter.image` 时回退到正文首图，并恢复左图右文布局。

![`/posts` 正文首图封面回退已恢复双栏卡片](./assets/posts-cover-fallback.png)

## 资产晋升（Asset promotion）

None

## 实现里程碑（Milestones / Delivery checklist）

- [x] M1: 新增 Astro 公共封面 helper，并让 `/posts` 使用正文首图回退。
- [x] M2: 让 `RelatedPostCard` 复用解析逻辑且保持外链封面屏蔽。
- [x] M3: 补齐测试夹具、单测、访客 E2E 与视觉证据。

## 方案概述（Approach, high-level）

- 把正文首图封面回退封装为 Astro 侧共享 helper，只改变卡片渲染层，不改变快照导出语义。
- `/posts` 允许外链封面，`RelatedPostCard` 明确选择不允许外链，以保持现有相关文章视觉与安全边界。
- 通过稳定本地测试文章和访客 E2E 锁住回归面，再用本地 Astro 预览补视觉证据。

## 风险 / 开放问题 / 假设（Risks, Open Questions, Assumptions）

- 风险：如果正文首图是很大的外链资源，列表页可能额外触发外部加载，但这是本次已接受的 `/posts` 设计选择。
- 需要决策的问题：None
- 假设（需主人确认）：None

## 变更记录（Change log）

- 2026-04-21: 创建 spec，冻结 `/posts` 正文首图封面回退的范围、优先级与验证口径。
- 2026-04-21: 完成共享封面 helper、`/posts`/`RelatedPostCard` 接入、测试夹具、回归验证与视觉证据落盘。
- 2026-04-21: 根据 review 修正 `RelatedPostCard` 的候选选择，保留“外链 Markdown 图可被后续本地 wiki 图补位”的旧行为。
- 2026-04-21: 根据 review 修正 Markdown 图片可选 title 的解析，并让 `RelatedPostCard` 复用已选中的候选封面而不是重新回退。
- 2026-04-21: 根据 review 让相关文章打分与真实封面选择保持一致，避免“能显示封面但仍按无封面排序”的偏差。
- 2026-04-21: 根据 review 把 Markdown 首图解析改为按括号层级取完整目标，避免带括号文件名或签名 URL 被截断。

## 参考（References）

- `docs/specs/phgpd-astro-front-phase1/SPEC.md`
- `docs/specs/n8ure-nature-front-ui/SPEC.md`
