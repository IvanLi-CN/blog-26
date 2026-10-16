# System Share Memos 主题历史

> 这里记录主题局部生命周期、兼容性与必要背景；完整取舍保留在 `docs/adr/`。

## Lifecycle / Compatibility

- New topic. The first compatibility contract targets installed Chromium-based Android and desktop PWAs.
- The current implementation adds the console-only share target, one browser-local IndexedDB pending slot, administrator confirmation, server-side reclassification, idempotent submission tracking, and attachment staging. Real installed-PWA system-share acceptance remains an empirical rollout gate.

## Replacements / Background

- The topic separates system-share ingestion from user-authored tag input while reusing the existing `#剪藏` parser contract. A confirmed URL share includes one system-generated `#剪藏` marker in the Memo body, keeps the frontmatter tag list unchanged, and manual, MCP, and filesystem paths retain their existing clipping rules.
- The public static site remains read-only for this capability; the console owns authentication, writes, and the share-target runtime.
- The publish UX contract now requires a console-wide Toast for publishing, success, and retryable failure; success navigates to the created Memo detail route, while failure keeps the confirmation page and exposes an in-Toast retry action.
- Each browser-received share owns one client-generated temporary submission identity. Edits, refreshes, retries, and lost-response recovery reuse it; a new system share receives a new identity, and completed replays return the original Memo detail identity.
- The confirmation action is a filled primary button, and the official `/share` route requires owner-reviewable mobile and desktop visual evidence after candidate implementation; production release waits for owner confirmation.
- The confirmation surface now follows the existing Memo authoring model: the original share is expandable and read-only, while parsed text or remarks enter one Memo content editor. Title, URL, and tags are retained as submission metadata instead of separate editor fields.
- Share-origin clipping content now starts with the target URL, keeps the editable remarks, and ends with one system-generated `#剪藏` parser marker. The editor and server both recognize plain URLs, Markdown links, and autolinks after Milkdown serialization, so the Memo remains visibly and mechanically identifiable as a clipping without a separate tag field.
- The recovery implementation extends `system_share_submissions` with the Memo slug, classification, lease token, and lease expiry. A deterministic system-share source path and persisted submission identity let a retry recover a Memo after the process fails between file publication and completion recording; an existing completed row whose Memo is missing is reported as deleted rather than recreated.
- The current candidate was checked on the official console `/share` route at 390x844 and 1440x1000. It shows a filled primary action, global publishing/success Toasts, a retryable failure Toast, and a returned-slug detail page. The captures remain pending owner confirmation; real installed-PWA system-share behavior remains a deployment check.

## Related Changes

- [Implementation status](./IMPLEMENTATION.md)
- [Migration 0013](../../../drizzle/0013_system_share_submissions.sql)
- [Migration 0016](../../../drizzle/0016_system_share_recovery.sql)

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- [ADR 0020](../../adr/0020-console-pwa-system-share-target.md)
