# 文章列表标题对比度一致性（#0003）

## 状态

- Status: 已完成
- Created: 2026-01-17
- Last: 2026-01-17

## 背景 / 问题陈述

在文章列表页（`/posts`）中，文章标题（每条卡片的 `h2 > a`）在部分主题下出现“对比度过低”的现象：标题文字变得非常浅，甚至比摘要/元信息更不醒目，影响可读性与信息层级。

复现证据（本地 dev 复现）：

- 主题 `light`：标题颜色与页面正文色一致（可读性正常）。
- 主题 `nord`：标题 computed `color` 显著变浅（例如 `oklch(0.869 0.022 252.894)`），而同页正文/容器 `color` 仍为较深色（例如 `oklch(0.32437 0.022 264.182)`），导致标题对比度显著下降。

## 目标 / 非目标

### Goals

- `/posts` 列表中文章标题在所有主题下都保持足够对比度，且标题层级应比摘要更醒目。
- 标题颜色策略显式绑定到站点语义色（daisyUI token），避免在某些主题下被“默认 heading/link 样式”拉低对比度。
- 尽量减少对 `dark:` 的依赖，优先使用语义 token（如 `text-base-content`、`text-primary` 等）确保跨主题一致。

### Non-goals

- 不调整文章列表布局、卡片结构与交互（仅处理颜色/对比度与相关的状态样式）。
- 不涉及文章数据、tRPC、DB、WebDAV、权限逻辑等任何业务变更。
- 不做全站链接风格统一（仅修复 `/posts` 列表标题链接；若需要全站统一，另开计划）。

## 用户与场景

- 访客：浏览 `/posts` 列表，依赖标题识别与扫描文章。
- 管理员：同样浏览 `/posts` 列表（管理员标记仅影响附加信息，不应影响标题可读性）。

## 范围（Scope）

### In scope

- `src/components/blog/BlogListItem.tsx`：文章标题链接（以及必要时同一区域的时间/作者图标）颜色与状态样式。
- 验证范围：至少覆盖 `light` / `dark` / `system` 三种主题模式在 `/posts` 页的表现。

### Out of scope

- 文章详情页（`/posts/[slug]`）的 Markdown 渲染样式（已由其他工作项覆盖，或另行开计划）。
- 任何与主题切换逻辑相关的改动（除非确认根因再次指向“暗色判定不一致”）。

## 需求（Requirements）

### MUST

- 在 `/posts` 中，文章标题在所有主题下不出现“比摘要更淡/更难读”的情况。
- 标题默认态具备足够对比度（参考 WCAG 2.1 AA：正文对比度 ≥ 4.5:1；大号标题 ≥ 3:1）。
- 标题 hover/active 样式保持可读且与主题一致；不得只在 `dark:` 下“补丁式修复”。
- visited 状态不应造成标题颜色降低对比度或出现主题不一致（应保持与默认态同一策略）。

### SHOULD

- 颜色策略使用 daisyUI 语义 token（`text-base-content`、`text-primary`、`text-base-content/70` 等），避免硬编码 `text-blue-*` / `text-slate-*`。
- 文章列表标题风格与同页的其他文字信息（时间/作者）在亮色/暗色下保持协调（不出现某一部分“看起来没被主题接管”）。

### COULD

- 增加一个最小的 Playwright E2E 覆盖，用于防止标题链接颜色回退到默认链接色（通过 CSS class/computed style 快照或视觉断言，按现有测试习惯选择）。

## 接口清单与契约（Interfaces & Contracts）

| 接口（Name） | 类型（Kind） | 范围（Scope） | 变更（Change） | 契约文档（Contract Doc） | 负责人（Owner） | 使用方（Consumers） | 备注（Notes） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | - | - | - | - | - | - | - |

## 验收标准（Acceptance Criteria）

- Given 主题为 `light`
  When 打开 `/posts`
  Then 文章标题默认态对比度满足可读性要求，且标题层级应显著强于摘要。

- Given 主题为 `dark`
  When 打开 `/posts`
  Then 文章标题默认态对比度满足可读性要求，且标题层级应显著强于摘要。

- Given 主题为 `nord`（或其他出现问题的亮色主题）
  When 打开 `/posts`
  Then 文章标题不应出现“明显变浅”的回归（标题颜色应与 `text-base-content` 同一语义层级）。

- Given 任意主题
  When 标题被访问过（visited）
  Then 标题颜色不降低对比度，仍保持站点定义的颜色策略。

- Given 任意主题
  When hover 标题
  Then 标题颜色/效果符合主题（例如强调色），并保持可读。

边界/回归检查：

- 不应影响同页的其他交互元素（标签、按钮、分页）可读性与颜色策略。
- 不应引入仅暗色/仅亮色可见的“对比度倒挂”。

## 约束与风险

- `git fetch --prune` 在本次计划创建时无法连接远程（SSH 连接中断），可能导致无法确认是否存在上游最新相关改动；实现前建议先恢复远程可用性并同步基线。
- 若修复采用“标题显式设置为 `text-base-content`”，需要确保 hover 状态仍能清晰表达“可点击”（例如维持 `hover:text-primary` 或 `hover:underline`）。

## 非功能性验收与交付门槛（Quality Gates）

- `bun run check`
- `bun run test`（若实现引入可单测的样式/判定函数或抽取常量）
- `bun run test:e2e`（若新增或调整相关 E2E）

## 文档更新（Docs to Update）

- None（仅样式修复；若最终需要新增“链接颜色策略”约定，再补充到现有设计文档中）

## 里程碑（Milestones）

- [x] M1: 复现与定位：确认标题颜色在 `nord` 下异常变浅
- [x] M2: 冻结期望：标题应使用语义正文色（`text-base-content`），hover 走 `text-primary`
- [x] M3: 实现与自测：标题显式绑定 `text-base-content`（移除 `dark:` 补丁式颜色）
- [x] M4: 自动化回归：新增最小 E2E 覆盖（`light`/`nord`/`dark`）

## 开放问题（Open Questions）

1. 是否需要把“排查范围”扩展到其他页面的 `h2`（例如使用 `font-heading` 且未显式 `text-base-content` 的组件，如 `src/components/ui/Headline.tsx`）？

## 假设（Assumptions）

- 假设标题默认态使用 `text-base-content`，并保留 `hover:text-primary`（必要时加 `hover:underline`）来表达可点击性。
