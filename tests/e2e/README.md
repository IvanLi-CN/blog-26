# E2E Testing

Playwright E2E tests live under `tests/e2e/` and use directory taxonomy as the canonical source of
coverage truth.

## Canonical taxonomy

- `full`: every `tests/e2e/**/*.spec.ts` except specs explicitly tagged `@targeted` or
  `@experimental`
- `targeted`: stable specs that are useful for explicit local diagnosis or narrow regression checks,
  but are not part of the default full contract
- `experimental`: unstable or still-evolving specs, or specs with strong external/runtime coupling
  that are not yet reliable enough for canonical full

Do not downgrade a spec only because it is slow. Full is the default.

## Projects

- `guest`: anonymous browser flows
- `admin`: administrator browser flows
- `user`: signed-in non-admin browser flows
- `mcp`: browser-side MCP HTTP verification

The union of these four projects is the canonical full set for both local runs and CI. Runtime
topology may differ, but coverage must not diverge.

## Commands

```bash
# Canonical full: reset once, build once, then run isolated projects in parallel
bun run test:e2e

# Run a single canonical project
bun run test:e2e:project -- guest
bun run test:e2e:project -- admin
bun run test:e2e:project -- user
bun run test:e2e:project -- mcp

# Explicit non-full tiers
bun run test:e2e:targeted
bun run test:e2e:experimental

# Playwright UI / debug entrypoints
bun run test:e2e:ui
bun run test:e2e:debug
bun run test:e2e:headed
```

## Runtime model

- Shared reset/build: `bun run test:e2e` resets fixture data once and builds production artifacts once
- Isolated execution: each project receives its own cloned DB, local content root, and ports
- Shared lifecycle: browser-side MCP verification uses the same Playwright-managed app lifecycle as
  other E2E projects
- Reports: per-project HTML/JSON output is written under `test-results/<project>/`

canonical E2E 与 Web Demo 另在日志输出 `[e2e-timing]`：按文件汇总 navigation、action、assertion、wait、other 的执行毫秒数、attempt 数，以及最慢十个用例的文件名和行号。分类区间可能重叠，跨用例也可能并发，不能相加作为 job 墙钟；`observed_union_ms` 只消除同一 attempt 内的重叠。摘要不包含用例标题、URL、selector、参数或错误正文，不改变失败、重试和测试收集行为。

## Tagging rules

Use Playwright tags in test code as the only source of non-full classification.

```ts
test.describe("group", { tag: "@targeted" }, () => {
  // ...
});
```

Prefer tagging at the smallest scope that matches the intent. If an entire file belongs to
`targeted` or `experimental`, tag the top-level `test.describe(...)` block.

## Auth model

- `admin` and `user` projects inject the SSO header only for the application origin
- `guest` runs without injected identity
- Manual verification should continue to use `/api/dev/login` or a real auth path; the header
  injection is an E2E-only test fixture

## CI 执行

`bun scripts/run-e2e.ts ci-project guest` 为 guest/admin 各创建两个测试分片，user/mcp 保持一个进程。每个 CI job 先 reset 和构建一次，再为每个分片复制独立数据库与内容目录，分配应用/媒体端口和报告路径；每个分片单 worker。guest 将重型 mobile-reading-surface 文件与其他文件分组，admin 使用 Playwright 的测试级分配；全部退出结果共同决定 required check，不减少 canonical full 覆盖。性能与失败传播合同见 [CI 执行效率](../../docs/specs/ci-performance/SPEC.md)。

## 测试分层与后端 project

`mcp` 保留 Playwright runner 和 canonical check 名称，但用例通过真实 HTTP 调用生产 gateway，不依赖浏览器、前端构建或媒体 sidecar；准备仍执行数据库迁移、seed、内容初始化与版本生成，就绪地址为 `/api/version`。

API 参数、SQLite 会话与 Demo 业务状态由 `src/server/dev-api/auth.test.ts`、`apps/admin/src/demo/business-contracts.test.tsx` 承接。真实交互继续留在 E2E；逐项映射见 [CI 性能实现边界](../../docs/specs/ci-performance/IMPLEMENTATION.md#测试意图迁移映射)。`project-runtime-motion.spec.ts` 固定自身 viewport 并内部覆盖移动尺寸，只需跑一次，不能因外层移动命令不再重复它而删除其中的移动场景。

Web Demo CI 使用 `tests/e2e/web-demo/ci.config.ts`，桌面和移动各执行一次，public 与 console 预览必须同时可用。三个 project 共用最多两个 worker，分别保留各自的 baseURL、重试和并行语义；单独调试仍使用原 `playwright.config.ts`。`@own-viewport` 用例在首次导航前自行设置尺寸，仅在 CI 桌面轮次执行一次，内部移动、桌面和触摸断言完整保留，标签不影响单独调试。用 `bun test tests/ci/web-demo-ci-coverage.test.ts` 核验收集与调度边界。
