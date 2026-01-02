# 标签与分类图标系统（运行时 LLM 生成 + 校验）

## 目标

- 为标签与分类提供稳定、可控的图标来源，渲染端继续使用 `@iconify/react`。
- 不依赖任何预生成步骤与外部搜索服务。应用运行时由 LLM 直接生成候选图标 ID，并对每个候选进行存在性校验（Iconify 渲染端已依赖线上分发，因此校验不新增外部依赖类别）。
- 结合 AI（LLM）在小候选集上精排，形成“高置信度自动落库、低置信度人工确认”的闭环。

## 数据模型

- 标签沿用表 `tags` 的 `icon` 字段存储 Iconify ID（如 `simple-icons:docker`）。
- 新增表 `tag_categories`：集中管理分类元数据与图标。
  - `key TEXT PRIMARY KEY`
  - `title TEXT`
  - `icon TEXT`（Iconify ID）
  - `description TEXT DEFAULT ''`
  - `created_at INT`
  - `updated_at INT`

## 图标库与来源

优先选择“单色/非彩色”的品牌/技术/概念图标集（排除彩色集，如 logos/skill-icons/devicon 等）：

- `simple-icons`（`simple-icons`）：单色品牌/技术 Logo，CC0-1.0，覆盖最广。
- `CoreUI Brands`（`cib`）：单色品牌集，CC0-1.0。
- `Font Awesome 6 Brands`（`fa6-brands`）：单色品牌集，Free 版本可用。
- `BoxIcons Logos`（`bxl`）：品牌 Logo（线性/单色）。
- `Tabler Icons`（`tabler`）：线性/单色，概念/动作覆盖广。
- `Line MD`（`line-md`）：线性/单色，动作/状态丰富。
- `Carbon`（`carbon`）：线性/单色，企业级通用符号。
- `Material Symbols`（`material-symbols`）：单色/可变粗细，概念/动作完备。
- `Game Icons`（`game-icons`）：单色，图形/象形符号丰富（适合某些抽象概念）。

不做离线目录或离线名称清单。渲染仍走 Iconify 分发（项目已在用 `@iconify/react`），候选经由运行时 LLM 生成并即时校验。

## 匹配流程

1. 归一化：将标签/分类名称做大小写与字符归一（例如 `.`→`dot`、`+`→`plus`、`#`→`sharp`），不使用任何本地别名映射。
2. 候选生成：仅由 LLM 产出 `prefix:name` 候选（≤10 个），提示词约束可优先 simple-icons / devicon 等集合；不做本地映射或启发式匹配。
3. 校验：对每个候选执行 HEAD 请求校验是否存在；仅作为存在性验证，不参与匹配逻辑。
4. 选择：以 LLM 顺序作为首要依据生成 `{icon, confidence, reason}`；无 LLM 配置或失败则返回“无候选”。
5. 写入策略：
   - 若已有人工设置，绝不覆盖。
   - 为空且 `confidence ≥ 阈值(默认0.85)` 自动落库；否则作为“建议”供管理员在 UI 采纳。

## 服务与模块

- `src/lib/icons/aliases.ts`：归一化与校验工具（不含本地映射）。
- `src/server/ai/icon-reranker.ts`：LLM 重排适配（OpenAI/OpenRouter/Ollama 可选）。
- `src/server/services/icon-validate.ts`：候选存在性校验与缓存。
- `src/server/services/tag-icons.ts`：对外暴露 `suggest/assign` 能力（标签与分类）。

## API（仅管理员）

- `POST /api/admin/tag-icons/suggest`：输入 `type=tag|category` 与 `name|key`，返回候选与 AI 精选。
- `POST /api/admin/tag-icons/assign`：输入 `type`、`name|key`、`icon`，执行保存。

鉴权复用现有 dev 管理方案；保存时校验 `iconId` 合法性与前缀白名单。

## 管理界面（标签图标匹配页）

- 新增页面：`/admin/tag-icons`
- 按分类分组展示标签与分类；每一项可点击展开“候选面板”。
- 支持同时展开多个面板；点击展开即在后台生成最新候选，与历史候选一起显示（新候选附“刚生成”标记）。
- 每个面板内可一键采纳 AI 精选或手选候选，保存后即时更新列表。

## 批量操作

- 不提供离线脚本；在管理页面支持多面板同时展开，异步批量生成候选，点选保存。

## 缓存与配置

- 结果缓存键：`icon-suggest:{type}:{name}`，TTL 24h；人工保存时主动失效。
- 前缀白名单：`ICONIFY_ALLOWED_PREFIXES=simple-icons,cib,fa6-brands,bxl,tabler,line-md,carbon,material-symbols,game-icons`
- LLM 配置（沿用项目约定）：
  - API 地址：`OPENAI_API_BASE_URL`（或 `OPENAI_BASE_URL`）
  - API Key：`OPENAI_API_KEY`
  - 模型名：`TAG_AI_MODEL`（或 `CHAT_COMPLETION_MODEL`）

## 测试要点

- 单测：归一化/别名、候选召回与排序、阈值分支。
- 集成：mock AI，验证“空值高置信自动写入、低置信建议保留”。
- E2E：在 `/admin/tag-icons` 变更后，`/tags` 页面正确渲染。

## 显示与渲染（站点访问侧）

本节描述“标签图标如何在站点各页面展示”的设计。它与“运行时生成/落库”相互独立：即使图标已经写入
`tags.icon`，渲染端也必须显式读取并渲染该 icon，才能避免退化为默认的 `#` 图标。

### 现状问题（已确认）

- 数据层：`tags.icon` 已有大量非空数据。
- 展示层：文章与闪念的标签列表仍使用默认 Hash 图标，未读取 `tags.icon`。
- 标签详情页标题图标固定为 `hash`，未按标签配置展示。

### 目标行为

- 覆盖范围：所有“原本就显示了标签图标”的位置都升级为正确图标；不为原本无图标的位置新增图标。
- 匹配规则：标签匹配 **大小写不敏感**（优先精确匹配，再大小写回退）；层级标签支持 **leaf 回退**。
- 首屏：必须做到 **完全首屏 SSR 且按需**：
  - SSR 只为“首屏实际渲染到的标签集合”解析并渲染图标（不全量注入到 layout）。
  - 后续由前端动态加载的新内容，单独请求补齐其新增标签的图标映射。
- No-JS：禁用 JS 时尽量能看到首屏正确图标；若成本/性能影响过大，可允许降级为默认图标（非硬性要求）。

### 标签 → 图标解析规则

#### 输入归一化

- 清洗：`trim()`，移除前导 `#`（允许多个），移除空 segment，segment 间使用 `/` 连接。
- 该归一化应与站内 tag URL 构造策略一致（按 segment 编码、保持 `/` 作为分隔符）。

#### 解析优先级

给定一个待展示的 `tagTitle`，定义 `tagPath` 为归一化后的完整路径，`leaf` 为最后一个 segment：

1. `tagPath` 精确匹配（大小写敏感）
2. `tagPath` 大小写不敏感匹配（以 `lower(tag.id)` 为索引）
3. `leaf` 精确匹配
4. `leaf` 大小写不敏感匹配
5. 均未命中：降级为默认 `hash` 图标

#### 大小写冲突（确定性规则）

当数据库存在多个 `tags.id` 仅大小写不同（`lower(id)` 相同）时，必须使用确定性规则选择：

1. 优先 `icon` 非空的记录
2. 其次按 `id` 字典序最小（保证跨运行一致）

### 数据获取与接口边界（按需）

为避免在 layout 层注入“全库标签图标表”，在服务端与客户端都提供“按需批量查询”的能力：

- 服务端内部函数（建议形状）：
  - `resolveTagIconsForTags(tags: string[]): Promise<Record<string, string | null>>`
  - 输入为“页面首屏渲染会用到的标签文本数组”，输出为“归一化 tagPath -> iconId”的映射（已应用 leaf 回退）。
- 前端动态加载补齐：
  - 暴露一个批量接口（tRPC 或 API Route 均可），输入 `tags: string[]`，输出 `icons: Record<string, string | null>`。
  - 前端在加载更多/无限滚动拿到新 item 后，收集新增标签（去重）再调用该接口。

> 注意：本节只定义接口形状与边界；具体落地在实现阶段完成。

### 首屏 SSR 图标渲染策略（按需）

`@iconify/react` 在浏览器会按需拉取图标，但“首屏 SSR + No-JS”要求意味着服务端需要能直接输出 SVG。

推荐策略：

1. 服务端根据首屏标签解析得到 `iconId` 列表（例如 `simple-icons:typescript`）。
2. 按 prefix 分组，通过 Iconify Public API 批量获取 icon data：
   - `GET https://api.iconify.design/{prefix}.json?icons={name1},{name2},...`
   - 不同 prefix 需要分别请求。
3. 使用 `@iconify/utils` 的 `iconToSVG()` 将 icon data 转换为 SVG body + attributes，再拼装成完整 `<svg>...</svg>`：
   - `width/height` 建议交由 CSS 控制（或设置为 `1em`），`fill` 使用 `currentColor`。
4. SSR 直接输出 SVG（例如通过 `dangerouslySetInnerHTML` 或 `react` 元素树拼装），确保禁用 JS 也可见。
5. 失败处理：任何 icon 拉取失败或数据不完整时，回退到默认 hash（不阻塞页面首屏内容）。

缓存建议（实现阶段细化）：

- 以 `iconId` 为 key 做内存缓存（TTL 可 24h）；必要时结合 Iconify 的 `last-modified` API 失效旧缓存。
- 对批量请求做 URL 长度与数量分片，避免过长 query。

### 涉及页面/组件范围（非穷举，按“会显示标签 icon”的地方）

- 文章：列表/详情/相关列表等所有使用共享 Tag 组件的位置。
- 闪念：卡片/详情/时间线等所有使用共享 Tag 组件的位置。
- 标签详情页标题：显示该标签的图标（按上述解析规则）。
- `/about`：统计文案使用“总内容数”（统计口径不排除 `project`）。

`/search` 不纳入验收，但若复用同一套 Tag 组件/数据通路，允许顺带改善。
