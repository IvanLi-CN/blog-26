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
