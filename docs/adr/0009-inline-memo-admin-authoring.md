# Keep Memo Authoring Before the Memo List

Status: superseded by ADR-0010 for deployment and public/admin list composition

The author uses the Memos page to capture a thought quickly and manage saved entries. Keep administrator-only authoring inline on `/memos`, before the Memo list, rather than making the editor part of the list or requiring a separate authoring workflow. The author's first task is quick creation, so the full-size editor leads the admin area and a single management list follows it. ADR 0010 supersedes the shared public-route deployment decision and the requirement to render a second public timeline for administrators.

This preserves the quick-entry path and keeps the editor visually separate from list reading. The management list continues to use the public Memo card language while adding the administrator actions required by the console.
