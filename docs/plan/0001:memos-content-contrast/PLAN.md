# 修复 Memos Markdown 主题对比度（#0001）

## 状态

- Status: 待实现
- Created: 2026-01-15
- Last: 2026-01-15

## 背景 / 问题陈述

在 `Memos` 列表/详情页中，Markdown 渲染内容在某些主题组合下出现“文字与背景对比度过低”的情况，导致正文难以阅读（尤其是列表/编号/正文段落等）。该问题会随着主题切换（亮色/暗色，以及不同 daisyUI 主题）出现或加重。

## 目标 / 非目标

### Goals

- 让 `Memos` 列表页与详情页的 Markdown 正文在亮色/暗色主题下都保持可读（对比度稳定）。
- 统一主题系统中“暗色判定”的来源，避免 `dark:` 样式在不该生效时生效、或该生效时不生效。
- 不改变现有 `Memos` 信息结构与布局（仅修复样式/对比度）。

### Non-goals

- 不重做主题系统（不新增复杂的自动主题亮度识别算法，除非必要）。
- 不修改 Memo 内容数据、不处理附件加载失败等网络问题（另开计划/issue 再处理）。
- 不引入新的 UI 框架或新的样式工具链。

## 范围（Scope）

### In scope

- `src/components/common/ThemeToggle.tsx`：暗色主题判定逻辑与配置对齐（避免 hardcode 与配置分叉）。
- `src/config/site.ts`：主题分组/清单作为单一事实来源（如需调整分组，明确规则）。
- `src/components/common/MarkdownRenderer.tsx`：Markdown 元素（p/ul/ol/li/a/code/blockquote/pre/table 等）的颜色策略改为基于 daisyUI token（例如 `text-base-content`、`bg-base-*`），减少对 Tailwind 灰阶与 `dark:` 的依赖。
- `src/components/memos/MemoCard.tsx`、`src/components/memos/MemoDetailPage.tsx`：必要时补齐 `prose`/排版类名策略，使 Memo 与 Post 的 Markdown 视觉一致且可控。
- 自动化验证：补充/更新 Playwright E2E 用例覆盖主题切换下的可读性回归（至少覆盖 `light`/`dark`/`system`）。

### Out of scope

- 任何与业务数据、tRPC 接口、DB、WebDAV、缓存策略相关的变更。
- 主题色审美层面的“重新配色”（本计划只处理可读性/对比度与一致性）。

## 需求（Requirements）

### MUST

- `Memos` 页 Markdown 正文在 `light` 与 `dark`（以及 `system` 映射到的结果）下可读，不出现“正文几乎贴背景色”的情况。
- 覆盖主题范围：对 `ThemeToggle` 中可选的**全部主题**做一次验证（来源：`src/config/site.ts` 的 `UI.theme.allThemes` 与 `UI.theme.mainThemes`）。
- 列表/编号（`ul/ol`）、段落（`p`）、标题（`h1..h6`）、链接（`a`）、内联代码与代码块（`code/pre`）、引用（`blockquote`）在 `Memos` 页均有稳定、可预测的主题适配。
- 主题切换后，`documentElement` 上的 `data-theme` 与 `dark` class 状态一致且符合预期（暗色主题应启用 `dark` class，亮色主题不应启用）。
- 提供可重复的验证步骤（本地 dev + Playwright E2E）。

### SHOULD

- 颜色使用 daisyUI 语义 token（`text-base-content` / `bg-base-*` / `link` / `text-primary` 等），避免硬编码 `text-gray-*` 与“只对 `dark:` 生效”的修补。
- `ThemeToggle` 的暗色主题名单不再散落多处：与 `src/config/site.ts` 对齐，或抽成可复用的单一函数/常量（实现阶段完成）。
- Markdown 渲染在 `posts` 与 `memos` 的差异可解释、可控（例如通过 `variant` 或 className 统一）。

### COULD

- 增加一条“主题诊断信息”（仅 dev 模式）：在页面上显示当前 `data-theme` 与 `dark` class 状态，便于复现与排查。
- 为高风险主题（例如 `sunset`、`aqua`、`business` 等）补充额外覆盖用例（如它们确实被认为是暗色/亮色）。

## 接口契约（Interfaces & Contracts）

None

## 验收标准（Acceptance Criteria）

- Given 当前主题为 `light`
  When 打开 `/memos`
  Then 每条 memo 的正文（段落/列表/标题/链接/代码）均清晰可读，且与卡片背景对比度足够。

- Given 当前主题为 `dark`
  When 打开 `/memos`
  Then 每条 memo 的正文（段落/列表/标题/链接/代码）均清晰可读，且与卡片背景对比度足够。

- Given 当前主题为 `system`
  When 系统偏好为浅色/深色并打开 `/memos`
  Then UI 行为与 `light`/`dark` 一致且可读。

主题覆盖要求：

- Given `ThemeToggle` 可选主题集合（`UI.theme.allThemes` + `UI.theme.mainThemes`）
  When 逐个切换主题并访问 `/memos`
  Then 不出现“正文/列表编号/链接/代码块”与背景对比度过低导致难以阅读的情况。

复现入口要求：

- Given 你截图时为**默认亮色**（`light`）
  When 打开 `/memos` 的管理视图（管理员，包含私有 memo）
  Then 任意 memo 的 Markdown 正文不应出现“像被 `dark:` 样式误触发而变成浅灰”的现象。

关键边界：

- Markdown 中包含 `ol/ul` 深层嵌套、长段落、行内 code、代码块、引用块、表格。
- 在 `MemoCard` 折叠状态下，渐变遮罩不应覆盖到导致正文“不可读”（允许渐隐，但应在合理范围内）。

## 非功能性验收 / 质量门槛（Quality Gates）

### Testing

- E2E tests: 新增/更新 Playwright 用例，覆盖主题切换后 `/memos` 顶部首屏内容的可读性回归（至少 `light`/`dark`/`system`）。
- Unit/Integration: 若实现引入“主题判定函数/配置抽取”，为其补充最小单元测试（确保主题名单不再漂移）。

### Quality checks

- `bun run check`
- `bun run test`（如涉及新增单测）
- `bun run test:e2e`（或至少跑与 memos 相关的 spec）

## 文档更新（Docs to Update）

- `docs/daisyui-local-theme-scope.md`: 若本次调整涉及主题作用域/暗色判定规则，补充“暗色判定与 dark class”的约定说明。
- `README.md`: 若项目对主题切换有新增约定（例如新增/调整主题分组），补充一条简要说明（仅在确有变化时）。

## 里程碑（Milestones）

- [ ] M1: 复现矩阵与根因确认（哪些主题/哪些页面/哪些元素受影响）
- [ ] M2: 冻结方案（暗色判定对齐 + Markdown 颜色策略落到 token）
- [ ] M3: 实现与自测（本地复现问题消失）
- [ ] M4: 自动化回归（E2E/单测/检查项通过）

## 方案概述（Approach, high-level）

- 暗色判定：以 `src/config/site.ts` 的主题分组为单一事实来源，`ThemeToggle` 不再维护一份独立 hardcode 名单；确保暗色主题必然添加 `.dark` class，亮色主题必然移除。
- Markdown 颜色策略：全站统一使用 daisyUI token（例如 `text-base-content`、`bg-base-200`、`link`、`text-primary`）替代 `text-gray-*` / `dark:text-gray-*`，减少“暗色判定不一致或 `dark:` 误触发”导致的对比度风险。
- 差异控制：对 `variant`（article/memo/preview）明确边界，仅在排版尺寸与特性开关上区分，颜色策略尽量一致。

## 风险与开放问题（Risks & Open Questions）

- 风险：
  - 统一暗色判定后，可能暴露出其他组件对 `dark:` 的隐含依赖（需要通过回归测试兜底）。
  - `highlight.js` 的主题样式（当前为 `github.css`）在暗色主题下可能需要调整，避免代码高亮对比度不稳定。
  - 颜色策略全站统一后，`posts` 的观感可能出现轻微变化；需要以“仅改颜色、不改排版”为原则控制影响范围，并在实现阶段做对照验证。

- 假设（Assumptions）：
  - 覆盖所有主题的验收以“可读性”为主：以 WCAG 2.1 AA 为参考（普通正文对比度 ≥ 4.5:1；大号标题 ≥ 3:1），并允许对极少数主题在**不破坏全站一致性**的前提下做定向修补。
  - 你截图时的“默认亮色”场景可通过自动化主题巡检复现并定位（不依赖人工提供 `localStorage` 值）。

## 参考（References）

- `src/components/common/ThemeToggle.tsx`
- `src/components/common/MarkdownRenderer.tsx`
- `src/components/memos/MemoCard.tsx`
- `src/components/memos/MemoDetailPage.tsx`
