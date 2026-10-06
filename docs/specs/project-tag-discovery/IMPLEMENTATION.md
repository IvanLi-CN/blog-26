# 项目标签原生发现实现状态

## Current Status

- Implementation: in progress
- Lifecycle: active

## Implementation Coverage

- REQ-TAGS-001: `src/lib/project-catalog.ts` 保存获批的 15 项标签及首页 featuredTags；`site/lib/projects.ts` 保留路由、领域与相关内容入口。
- REQ-TAGS-002: `src/lib/tag-directory.ts` 聚合实体身份、祖先与分类型计数；`src/server/services/tag-content.ts` 复用内容权限及现有素材有效性读取。
- REQ-TAGS-003: `src/lib/snapshot-tags.ts` 读取时重新组合当前目录、旧快照记录及可用公共元数据；保留原生成时间。
- REQ-TAGS-004: tag-service、tags router 与既有管理/MCP 消费者共享目录；`tag-group-identity.ts` 保留 AI 标签规范身份。
- REQ-TAGS-005: NativeTagLink 与 Astro 包装器共享静态呈现，首页/详情可导航，标签详情分区，索引显示三类计数，feed 保持 dated-only。桌面项目使用原生卡片、移动端使用连续阅读行；ProjectTagLogo 为全部项目提供方形 Logo/Icon 区域，8 项复用现有品牌资源，其余使用静态本地图标。非方形资源完整保留比例，单色 Logo 随主题着色。

## Verification

- `bun run check` and Spec structural contract check pass; existing Biome warnings remain non-blocking.
- Agent VM runs the required pre-commit suite as an ordinary user: 782 tests, 3516 assertions pass after mainline synchronization. Permission-sensitive rollback tests require a non-root runner. The explicit HTTP compatibility suite passes 94 tests and 531 assertions.
- Tag aggregation, permissions, inline Memo tags, unavailable local media, old-bundle reconstruction, metadata pruning, exact-case matching, cursor IDs containing underscores, admin organizer/icon overview and AI canonical identity have direct automated coverage.
- Controlled `bun scripts/build-project-tags-demo.ts` builds the actual static Astro templates from an old-format fixture. The full `site:build`, PWA, poster and social-preview artifact checks pass. Mirrored VM source sets `PLAYBOOK_RENDERER_COMMIT` to its full source commit SHA.
- `bun run console:build` and `bun run build-storybook` pass in Agent VM. Builds run separately within its memory limit.
- `STORYBOOK_STORY_PREFIX=public-native-tag-link-- bun run test:storybook-interactions` passes all four affected component play functions, including themes, focus, long labels and 393px states.
- Controlled static, isolated SQLite-backed SSR and `/blog` static fixtures each pass 230 page/theme/viewport checks at 1280, 393, 375, 360 and 320px, for 690 checks overall. These assert complete tags, featured subsets, native navigation, section ordering, counts, minimum targets, focus, overflow, desktop cards, mobile rows, square Logo/Icon regions, original image proportions, fallback SVGs, dated empty states, feeds and unknown-tag 404s.
- An official MCP SDK client against the isolated console confirms `tags.list` includes Harness project associations and React with 10 projects and 12 total entities.
- `readTagRoutePath` reads raw URL segments exactly once. Regression coverage includes spaces, plus, superscripts, reserved characters, literal percent escapes and a `/blog` base path. This avoids Astro's partial URI decoding of reserved characters.

## Remaining Gaps

- Mobile tag density follows the accepted 13px text / 26px single-line pill design while retaining the 44px link target. The density candidate passes static and SSR builds, all four Storybook plays, 782 pre-commit tests and 230 static browser checks. Fresh validation after canonical mainline synchronization and mobile images remain pending.
- Screenshot comparison is current-only and awaits owner confirmation before canonical asset persistence.
- Formal Tier 3 four-lane review and current-head PR/CI convergence remain pending.

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
