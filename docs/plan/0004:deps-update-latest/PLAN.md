# 全量依赖升级到 Latest（Bun）（#0004）

## 状态

- Status: 已完成
- Created: 2026-02-09
- Last: 2026-02-09

## 背景 / 问题陈述

当前项目依赖存在较多可更新项（含多个 major 版本升级）。长期不更新会带来：

- 安全与稳定性风险（上游修复无法及时获得）
- 开发体验下降（类型定义漂移、工具链版本不一致）
- CI/本地验证成本上升（未来一次性大升级更难排查）

本计划目标是：把 `package.json` 的 `dependencies` 与 `devDependencies` **全部升级到 Latest**，并完成必要的兼容性适配，保证全套质量门槛通过。

## 目标 / 非目标

### Goals

- 升级所有 direct 依赖（含 dev）到 Latest（允许 major）。
- 更新 `bun.lock` 并确保安装可复现。
- 修复因升级带来的 TypeScript/运行时报错与测试失败（最小改动原则）。
- 完成 Full 验证：`bun run check`、`bun test`、`bun run build`、`bun run test:e2e` 全部通过。

### Non-goals

- 不做“顺手重构”、不引入新功能、不调整产品交互。
- 不替换技术栈（例如将某个库替换为另一个库）除非 Latest 已不可用且不存在最小修复路径（遇到此类情况先报阻塞点）。

## 范围（Scope）

### In scope

- `package.json`：更新所有 direct dependencies/devDependencies 到 Latest。
- `bun.lock`：随升级更新。
- 必要的源代码适配（例如 Zod/OpenAI/uuid/nodemailer 的类型或 API 变更适配）。
- 必要的测试用例/测试工具修复（保持原意，不改测试目标）。
- `docs/plan/**`：记录关键破坏性变更与修复点。

### Out of scope

- 删除未使用依赖（除非它已造成阻塞且你明确要求清理）。
- 调整部署、迁移、DB schema（除非升级导致必须同步更新迁移工具链，且变更范围可控）。

## 需求（Requirements）

### MUST

- 执行 `bun update --latest` 后，`package.json` 与 `bun.lock` 反映 Latest。
- `bun outdated` 不再显示可更新项（或仅剩明确允许保留的项；默认应为 0）。
- 通过质量门槛（见下方验收/Quality Gates）。
- 兼容性修复遵循最小改动原则：只修“因升级而坏”的点。

### SHOULD

- 对关键 major（例如 `zod`、`openai`、`uuid`、`nodemailer`、`next`）的适配在计划文档里记录“变更点/风险点/验证点”，便于后续维护。
- 保持公开接口与行为不变（若变更不可避免，先记录并在 PR 说明中显式标注）。

## 验收标准（Acceptance Criteria）

- Given 在 topic 分支执行全量升级
  When 运行 `bun run check`
  Then 通过（无错误）。

- Given 依赖已升级
  When 运行 `bun test`
  Then 通过（无失败用例）。

- Given 依赖已升级
  When 运行 `bun run build`
  Then 通过（Next build 成功）。

- Given 依赖已升级
  When 运行 `bun run test:e2e`
  Then 通过（Playwright 全绿）。

- Given 依赖已升级
  When 运行 `bun outdated`
  Then 输出为空或仅包含你显式允许的例外（默认无例外）。

## 非功能性验收与交付门槛（Quality Gates）

- `bun run check`
- `bun test`
- `bun run build`
- `bun run test:e2e`

## 里程碑（Milestones）

- [x] M1: 建立分支 + 冻结计划文档（本文件 + Index 行）
- [x] M2: 执行 `bun update --latest`，完成依赖与锁文件更新
- [x] M3: 修复 lint/type/test/build 回归并通过 `check`/`test`/`build`
- [x] M4: 通过 `test:e2e` 并更新计划状态为 `已完成`

## 风险与应对（Risks）

- **major 级破坏性变更**：例如 `zod` v4 的错误格式化 API 变化、`openai` SDK 类型/错误类型变更等。
  - 应对：优先按官方推荐方式迁移；无法最小修复时先汇报阻塞点与影响范围，再请求你确认取舍。
- **工具链/运行时兼容性**：例如 `@types/node` 升级导致 TS/DOM 类型冲突。
  - 应对：优先修正类型使用方式/tsconfig 细节，不降级依赖；若确需 pin，先征求你同意。

## 参考（References）

- `package.json`
- `bun.lock`
- `src/server/trpc.ts`（Zod 错误格式化）
- `src/server/services/tag-ai.ts`、`src/server/ai/icon-reranker.ts`（OpenAI SDK）
- `src/lib/email.ts`（nodemailer）
- `src/lib/session.ts` 以及 `scripts/*`（uuid）

## 实现要点（Notes）

- 全量升级依赖并更新锁文件；`bun outdated` 输出为空。
- 修复 Milkdown/Crepe 初始化回归：通过 `package.json` `overrides` 固定 `prosemirror-state` 为单一版本，避免重复 keyed plugin。
- 测试数据生成默认离线（占位图），如需下载远端图片可设置 `TEST_DATA_DOWNLOAD_IMAGES=1`。
