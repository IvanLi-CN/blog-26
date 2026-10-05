# 项目标签原生发现实现状态

## Current Status

- Implementation: in progress
- Lifecycle: active

## Implementation Coverage

- REQ-TAGS-001: `src/lib/project-catalog.ts` 保存获批的 15 项标签及首页 featuredTags；`site/lib/projects.ts` 保留路由、领域与相关内容入口。
- REQ-TAGS-002: `src/lib/tag-directory.ts` 聚合实体身份、祖先与分类型计数；`src/server/services/tag-content.ts` 复用内容权限及现有素材有效性读取。
- REQ-TAGS-003: `src/lib/snapshot-tags.ts` 读取时重新组合当前目录、旧快照记录及可用公共元数据；保留原生成时间。
- REQ-TAGS-004: tag-service、tags router 与既有管理/MCP 消费者共享目录；`tag-group-identity.ts` 保留 AI 标签规范身份。
- REQ-TAGS-005: NativeTagLink 与 Astro 包装器共享静态呈现，首页/详情可导航，标签详情分区，索引显示三类计数，feed 保持 dated-only。

## Verification

- Passed: targeted Astro compiler syntax transforms for the five changed `.astro` surfaces（不是整站构建）。
- Passed: `bun run check`（现有 Biome 提示不阻断）；`git diff --check`；Spec structural contract check。
- Passed: `bun test src/lib/__tests__/tag-directory.test.ts src/lib/__tests__/tag-group-identity.test.ts tests/lib/project-tags-snapshot.test.ts src/lib/__tests__/public-site-snapshot-compat.test.ts src/lib/__tests__/tag-href.test.ts`：19 tests、271 assertions。
- Added, not yet executed: tag service/database eligibility and metadata tests; tags router permission, exact matching and pagination tests; protected admin/public HTTP tests; MCP catalog assertions。
- Added, not yet executed: NativeTagLink Storybook themes/mobile/focus/long-label play coverage and repository interaction runner registration。
- Controlled page demo: `bun scripts/build-project-tags-demo.ts` creates an old-format fixture and builds actual Astro templates without production DB or online content retrieval。
- Browser geometry/navigation: `PROJECT_TAGS_DEMO_URL=<leased demo URL> bun tests/lib/project-tags-browser.ts` covers desktop and 393/375/360/320 px, light/dark, all project tags, native section ordering, counts, RSS and unknown-tag status。

## Remaining Gaps

- Agent VM acquisition was retried after the instance-count denial. The current denial is `resource_insufficient`: other allocations use the full 24 GiB project memory ceiling, so the requested 8 GiB would exceed it. No VM lease or guest was created. Heavy validation awaits environment recovery or an explicit local-validation exception。
- Database/integration tests, static/SSR builds, Storybook build/play and controlled browser verification remain unverified。
- Visual evidence has not been captured or confirmed; canonical assets remain absent。
- Formal Tier 3 review, signed-off commits, PR publication and current-head CI have not started。

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
