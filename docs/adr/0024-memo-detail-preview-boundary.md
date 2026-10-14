---
status: accepted
---

# Keep Memo Details on Console and Author Preview in Admin

The Memo management list's eye action and author-facing detail links open `/memos/:slug` on the Console origin serving the request, while `/admin/preview/memos/:slug` remains a separate read-only author-preview route. Console administrator detail requests resolve the current live Memo, including private or draft content, administrator-readable media, and authorized clipping materials; public visitors and the static public site retain published-only visibility. This boundary separates reading a current Memo from checking its authoring presentation without hard-coding a deployment host or adding a host configuration option.

## Considered Options

- **Open the eye action on `/admin/preview/memos/:slug`**: rejected because the action is a Memo detail entry, and the author-preview shell is a different management-interface surface.
- **Open the eye action on the static public-site origin**: rejected because the Console detail must support current private/draft content and the public snapshot may lag behind saved content.
- **Make the Console origin a new host configuration option**: rejected because links can use the origin of the current Console request, avoiding deployment-specific code and configuration drift.

## Consequences

- Console Memo detail SSR must authorize the request before resolving live private/draft content and must choose administrator-readable media for authorized private content.
- The detail page retains administrator refresh, edit, delete, and dedicated author-preview actions; saving remains on the detail route and does not force public-snapshot publication.
- Unauthorized private/draft detail requests must keep the public not-found or unavailable presentation and must not disclose record existence.
