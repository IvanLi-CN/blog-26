# 全量 Direct 依赖升级到 Latest（#ejfkn）

## 状态

- Status: done
- Created: 2026-04-06
- Last: 2026-04-06

## 背景 / 问题陈述

- 当前仓库的 direct `dependencies` 与 `devDependencies` 存在一批可更新版本，包含多个 major 升级点。
- 继续滞后会放大后续一次性升级成本，也会让本地开发、CI 和类型系统逐步偏离上游工具链。
- 本轮目标是把 direct 依赖统一升级到 latest stable，并在不扩 scope 的前提下完成兼容性收敛。

## 目标 / 非目标

### Goals

- 升级 `package.json` 中全部 direct `dependencies` 与 `devDependencies` 到执行时的 latest stable。
- 刷新 `bun.lock`，保持依赖安装可复现。
- 修复因升级导致的编译、类型、测试、构建与 E2E 回归。
- 保持现有产品行为不变，不引入额外功能。

### Non-goals

- 不处理 Next 开发态资源占用优化开关或额外性能调优。
- 不做无关重构、依赖替换、未使用依赖清理或数据库 schema 变更。
- 不升级 Bun runtime；仅同步 direct 依赖中的 Bun 相关类型包。

## 范围（Scope）

### In scope

- `package.json` 与 `bun.lock` 的 direct 依赖升级。
- 升级导致的最小必要源码、测试与配置兼容性修复。
- 通过仓库既有质量门槛：`bun outdated`、`bun run check`、`bun test`、`bun run build`、`bun run test:e2e`。

### Out of scope

- 任何产品功能、UI、交互或公开 API 行为调整。
- 额外的开发体验优化、端口策略调整、Storybook 增补或视觉样式改动。
- PR 合并与 post-merge cleanup。

## 需求（Requirements）

### MUST

- 所有 direct 依赖升级到 latest stable，不保留“跳过 major”的默认例外。
- `bun outdated` 在收口时为空，或只剩明确记录的允许例外；本计划默认无例外。
- 修复 major 升级导致的 breaking changes，至少覆盖 `typescript`、`lucide-react`、`rate-limiter-flexible`、`@types/nodemailer` 以及 Next/React/tooling 相关变化。
- 最终 PR 必须达到 merge-ready，但不自动合并。

### SHOULD

- 保持兼容性修复聚焦在升级必需范围内，避免顺手重构。
- 在文档中记录关键 breaking changes、验证结果和仍需关注的风险点。

### COULD

- 若某个升级点需要额外的 targeted validation，可在 full validation 之前先补充局部验证加速排障。

## 功能与行为规格（Functional/Behavior Spec）

### Core flows

- 运行 direct 依赖升级命令后，仓库依赖面更新到最新稳定版本。
- 针对升级产生的编译、类型、测试、构建或 E2E 回归做最小必要修复。
- 推送分支并创建 PR，完成 CI 与 review 收敛，直到 PR 可以立即合并。

### Edge cases / errors

- 若某个 latest 版本导致不可接受的 breaking change，必须先定位真实断点，再以最小兼容修复处理；只有无法收敛时才作为阻断上抛。
- 若 PR 阶段发现同一根因重复回归，按根因批次修复，不做逐条 findings 式噪音返工。
- 若远端 CI 与本地表现不一致，需要保留证据并在 PR 描述与 spec 中记录差异。

## 接口契约（Interfaces & Contracts）

### 接口清单（Inventory）

None

### 契约文档（按 Kind 拆分）

None

## 验收标准（Acceptance Criteria）

- Given 当前分支完成 direct 依赖升级
  When 运行 `bun outdated`
  Then 输出为空。

- Given 当前分支完成兼容性修复
  When 运行 `bun run check`
  Then 检查通过。

- Given 当前分支完成兼容性修复
  When 运行 `bun test`
  Then 测试通过。

- Given 当前分支完成兼容性修复
  When 运行 `bun run build`
  Then 构建通过。

- Given 当前分支完成兼容性修复
  When 运行 `bun run test:e2e`
  Then E2E 通过。

- Given 分支已推送并创建 PR
  When CI 与 review 收敛完成
  Then latest PR 处于可立即合并状态，且未执行 merge。

## 实现前置条件（Definition of Ready / Preconditions）

- direct latest 升级范围已锁定为全部 direct 依赖
- 关键 breaking risks 已知并允许在本轮一并适配
- 质量门槛与收工条件已明确
- PR 终点锁定为 merge-ready

## 非功能性验收 / 质量门槛（Quality Gates）

### Testing

- Unit tests: `bun test`
- Integration tests: 由 `bun test` 覆盖现有集成用例
- E2E tests (if applicable): `bun run test:e2e`

### UI / Storybook (if applicable)

- Not applicable unless dependency upgrades cause visible UI regressions that require evidence during PR convergence.

### Quality checks

- Dependency drift: `bun outdated`
- Lint / typecheck / formatting: `bun run check`
- Production build: `bun run build`

## 文档更新（Docs to Update）

- `docs/specs/README.md`: 增加本 spec 索引并更新状态
- `docs/specs/ejfkn-deps-update-latest/SPEC.md`: 记录升级范围、breaking change 适配点、验证结果与 PR 信息

## 计划资产（Plan assets）

- Directory: `docs/specs/ejfkn-deps-update-latest/assets/`
- In-plan references: `![...](./assets/<file>.png)`
- Visual evidence source: maintain `## Visual Evidence` in this spec when owner-facing or PR-facing screenshots are needed.

## Visual Evidence

本计划默认不需要视觉证据；若依赖升级在 PR 收敛阶段引入可见 UI 行为变化，再按仓库规则补充。

## 资产晋升（Asset promotion）

None

## 实现里程碑（Milestones / Delivery checklist）

- [x] M1: 升级 direct dependencies 与 direct devDependencies，刷新 `bun.lock`
- [x] M2: 完成因升级导致的源码、类型、配置与测试兼容性修复
- [x] M3: 通过 `bun outdated`、`bun run check`、`bun test`、`bun run build`、`bun run test:e2e`
- [ ] M4: 推送分支、创建 PR，并把 latest PR 收敛到 merge-ready

## 方案概述（Approach, high-level）

- 先完成 docs/specs 迁移与分支准备，再执行一次全量 direct latest 升级。
- 优先以本地验证定位真实 breaking changes，按根因聚合做最小必要修复。
- 本地质量门槛通过后再进入 PR 收敛，避免把明显回归带到远端反复抖动。

## 风险 / 开放问题 / 假设（Risks, Open Questions, Assumptions）

- 风险：远端 CI 仍可能暴露本地未覆盖的平台差异，但本地验证已全部通过。
- 风险：开发态仍会输出若干非阻断警告，包括 Next/Turbopack NFT tracing、`sitemap.xml` 生成时的 repo-root `sqlite.db` 缺表日志、首页/列表页的相对时间 hydration warning、以及文章编辑器现有的嵌套 `button` hydration warning；本轮未扩 scope 处理这些既有问题。
- 需要决策的问题：None。
- 假设（需主人确认）：None。

## 实现结果（Implementation Notes）

- direct `dependencies` / `devDependencies` 已升级到执行时的 latest stable；`next` / `@next/mdx` 升级到 `16.2.2`，`typescript` 升级到 `6.0.2`，`@biomejs/biome` 升级到 `2.4.10`，`playwright` / `@playwright/test` 升级到 `1.59.1`，`tailwindcss` 升级到 `4.2.2`，并同步刷新 `bun.lock`。
- 为适配升级后的工具链，补充了最小必要的源码与测试修复，包括 Biome schema 更新、Bun test 排除 E2E 的配置、Milkdown 快速编辑器内容持久化归一化、若干 hydration 修复，以及一批 Playwright 导航/等待策略调整。
- 本轮未引入额外功能、性能调参或依赖替换。

## 验证结果（Validation Results）

- `bun outdated`: 通过，输出为空。
- `bun run check`: 通过；仍有既有 warning（`noArrayIndexKey`、`useOptionalChain`、单个 `noNonNullAssertion`），无阻断错误。
- `bun test`: 通过，`277 pass / 0 fail`。
- `bun run build`: 通过；保留既有 NFT tracing warning 与 `sitemap.xml` 生成时的 sqlite 缺表日志。
- `bun run test:e2e`: 通过，`71 passed / 1 skipped`。

## 变更记录（Change log）

- 2026-04-06: 从 `docs/plan/0004:deps-update-latest/PLAN.md` 迁移为 `docs/specs` 主规范，并锁定为全量 direct latest 快车道升级。
- 2026-04-06: 完成 direct latest 升级、兼容性修复与本地全量验证，等待推送分支与 PR 收敛。

## 参考（References）

- `docs/plan/0004:deps-update-latest/PLAN.md`
- `package.json`
- `bun.lock`
