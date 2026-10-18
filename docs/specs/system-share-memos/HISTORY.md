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
- The recovery boundary now publishes the deterministic Memo through a same-filesystem atomic hard-link from a lease-scoped temporary file; an interrupted temporary write cannot expose a partial Memo, and malformed legacy targets are repaired only under the active committing lease. Reclaimed retry failures retain staging owned by another lease until a complete replacement commit can safely reclaim it.
- Memo 文件的读取、异常修复和发布统一放在校验租约后的 SQLite 同步写事务内，避免旧持有者在租约被接管后误删新提交；恢复失败保留过期记录，后续成功重试仍可清理旧暂存附件。
- 发布成功提示的 1000ms 内保留本地槽位，实际跳转时才按提交 ID 清理；在提示期间刷新可恢复原始身份与编辑内容。
- The current candidate was checked on the official console `/share` route at 390x844 and 1440x1000. Both viewports show a filled primary action, global publishing/success Toasts, a retryable failure Toast, and a returned-slug detail page; the owner confirmed the candidate. The editor keeps its live content while publishing switches it to read-only, a failed retry preserves the edited content, and the mobile Demo control stays clear of the Toast and action row. Real installed-PWA system-share behavior remains a deployment check.
- The recovery and browser evidence pass was tightened after candidate review: system-share staging and Memo parents reject symlink traversal through Linux directory handles, an interrupted filesystem commit is recovered from the deterministic Memo path, process-exit staging is swept by age and lease ownership, stale lease cleanup cannot remove another attempt, deterministic Memo collisions are rejected without overwriting existing content, and the Web Demo tests clear the pending IndexedDB record without blocking an open page. Recovery now rebuilds the local Memo projection before completing a filesystem-only replay, and the admin continuation preserves a return to `/share` after authentication. Milkdown's escaped URL separator is canonicalized before editor persistence and server reclassification. System-generated clipping markers stay in the authored body without becoming frontmatter tags, and system-share attachments require administrator access at the file boundary. The final targeted candidate has 35 server API tests, 13 normalization tests, 44 content-source tests, and 9/9 Web Demo tests on both mobile and desktop; the remaining full-suite failures are documented environment or unrelated timeout residuals. Mobile failure and desktop publishing, success, and failure Toast assets were refreshed after the spacing fix and compared against the prior baseline.

## Related Changes

- [Implementation status](./IMPLEMENTATION.md)
- [Migration 0013](../../../drizzle/0013_system_share_submissions.sql)
- [Migration 0016](../../../drizzle/0016_system_share_recovery.sql)

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- [ADR 0020](../../adr/0020-console-pwa-system-share-target.md)
