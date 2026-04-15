# Admin HTTP APIs (`8amg2`)

## Goals

- Provide browser-facing admin resources rooted at `/api/admin/*`.
- Keep response shapes stable enough for a later Rust implementation to replace the compatibility layer without changing the SPA.
- Avoid direct browser dependence on `/api/trpc`.

## Resource inventory

| Path family | Methods | Purpose |
| --- | --- | --- |
| `/api/admin/session` | `GET` | Resolve current admin session state and user capability summary |
| `/api/admin/dashboard/stats` | `GET` | Summary cards/metrics |
| `/api/admin/dashboard/recent-activity` | `GET` | Dashboard activity feed |
| `/api/admin/posts` | `GET` | List/filter posts for admin table |
| `/api/admin/posts/:id` | `GET`,`PATCH`,`DELETE` | Post detail/update/delete |
| `/api/admin/posts/by-slug/:slug` | `GET` | Editor open-by-slug helper |
| `/api/admin/posts` | `POST` | Create post |
| `/api/admin/posts/batch` | `POST` | Batch update admin post metadata |
| `/api/admin/posts/vectorize` | `POST` | Trigger vectorization flows |
| `/api/admin/comments` | `GET` | Comments moderation list |
| `/api/admin/comments/:id` | `PATCH`,`DELETE` | Moderate/delete comment |
| `/api/admin/content-sync/system-config` | `GET` | Sync system config |
| `/api/admin/content-sync/manager-stats` | `GET` | Sync manager stats |
| `/api/admin/content-sync/content-stats` | `GET` | Content stats |
| `/api/admin/content-sync/sources-status` | `GET` | Per-source status |
| `/api/admin/content-sync/progress` | `GET` | Sync progress snapshot |
| `/api/admin/content-sync/trigger` | `POST` | Trigger sync |
| `/api/admin/content-sync/cancel` | `POST` | Cancel sync |
| `/api/admin/jobs` | `GET` | Job definitions/schedules |
| `/api/admin/jobs/runs` | `GET` | Job run list |
| `/api/admin/jobs/runs/:id` | `GET` | Job run detail |
| `/api/admin/jobs/runs/:id/log` | `GET` | Job run log |
| `/api/admin/jobs/trigger` | `POST` | Trigger a job |
| `/api/admin/pats` | `GET`,`POST` | List/create personal access tokens |
| `/api/admin/pats/:id/revoke` | `POST` | Revoke PAT |
| `/api/admin/tags/organize` | `POST` | Tag organize/suggest/apply flow |
| `/api/admin/tag-icons/suggest` | `POST` | Suggest tag icons |
| `/api/admin/tag-icons/assign` | `POST` | Persist icon assignment |
| `/api/admin/files/sources` | `GET` | Editor content sources |
| `/api/admin/files/tree` | `GET` | Directory listing |
| `/api/admin/files/read` | `GET` | Read file content |
| `/api/admin/files/write` | `POST` | Write file content |
| `/api/admin/files/rename` | `POST` | Rename file |
| `/api/admin/upload/*` | phase-local | Reserved namespace for future direct upload helpers |

## Cross-cutting rules

- Auth failures on page entry stay enforced at the gateway/page layer; API resources still return JSON auth errors (`401`/`403`) when called directly.
- Response bodies use plain JSON objects/arrays, not tRPC envelopes.
- Errors return `{ error: { code, message } }`.
- Cursor/filter params remain query-string based for list endpoints.
- The SPA may keep using `/api/files/*` for asset upload/read URLs produced by markdown editor content in this phase.
