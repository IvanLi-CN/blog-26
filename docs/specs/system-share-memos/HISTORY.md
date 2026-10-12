# System Share Memos 主题历史

> 这里记录主题局部生命周期、兼容性与必要背景；完整取舍保留在 `docs/adr/`。

## Lifecycle / Compatibility

- New topic. The first compatibility contract targets installed Chromium-based Android and desktop PWAs.
- The current implementation adds the console-only share target, one browser-local IndexedDB pending slot, administrator confirmation, server-side reclassification, idempotent submission tracking, and attachment staging. Real installed-PWA system-share acceptance remains an empirical rollout gate.

## Replacements / Background

- The topic separates system-share ingestion from the existing authored `#剪藏` trigger. A confirmed URL share can create a clipping without adding a visible tag, while manual, MCP, and filesystem paths retain their existing clipping rules.
- The public static site remains read-only for this capability; the console owns authentication, writes, and the share-target runtime.

## Related Changes

- [Implementation status](./IMPLEMENTATION.md)
- [Migration 0013](../../../drizzle/0013_system_share_submissions.sql)

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- [ADR 0020](../../adr/0020-console-pwa-system-share-target.md)
