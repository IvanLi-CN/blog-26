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
