# Specs Overview

`docs/specs/` is the primary source of truth for executable specs in normal/fast-track flows.
Legacy plans in `docs/plan/` remain readable but are no longer the preferred place for new work.

## Status

- `draft`: scope and acceptance are still changing.
- `ready`: scope and acceptance are frozen; implementation can start.
- `in-progress`: implementation is ongoing.
- `done`: implementation and verification are complete.
- `superseded`: replaced by another spec.
- Legacy rows may still use the status labels above. New specs created via `$docs-plan` should use the canonical statuses from the skill workflow.

## Index

| ID | Title | Status | Spec | Last | Notes |
|---|---|---|---|---|---|
| n8ure | Nature frontend redesign without DaisyUI | done | `n8ure-nature-front-ui/SPEC.md` | 2026-04-12 | Replace public DaisyUI styling with a dedicated Nature design system and stable visual evidence flow; Astro public theme persistence regression fixed. |
| n338y | Release failure Telegram alerts | in-progress | `n338y-release-failure-telegram-alerts/SPEC.md` | 2026-04-12 | Add a repo-local release failure notifier wrapper, emit explicit release target SHA markers, and keep a manual smoke path for Telegram alert validation. |
| ey3mm | PR + label driven release | in-progress | `ey3mm-pr-label-release/SPEC.md` | 2026-03-03 | Introduce deterministic release gate from PR labels and channel. |
| m4c9u | Local memo root keeps `Memos` case | done | `m4c9u-local-memos-root-case/SPEC.md` | 2026-03-10 | Keep local memo writes aligned with the synced `Memos` tree, keep active env parsing strict, ignore inactive local client overrides in webdav-only memo UI, route webdav-only memo uploads through the WebDAV file API, and block dot-segment memo roots. |
| mivez | Local content source uses real directory layout | in-progress | `mivez-local-real-content-layout/SPEC.md` | 2026-03-11 | Remove synthetic local wrapper directories, classify content from configured real roots, and keep admin local browsing aligned with the actual note tree. |
| ejfkn | Full direct dependency upgrade to latest | done | `ejfkn-deps-update-latest/SPEC.md` | 2026-04-06 | Migrate legacy deps-update-latest plan into docs/specs, complete the direct latest upgrade, and keep the branch ready for PR convergence. |
| phgpd | Astro public frontend migration + single-image transition | done | `phgpd-astro-front-phase1/SPEC.md` | 2026-04-09 | Move the public frontend to Astro, introduce compatibility HTTP APIs, keep single-image deployment with a gateway in front of legacy Next, and close the PR at merge-ready. |
| 8amg2 | Admin shadcn SPA + `/admin/*` ownership migration | done | `8amg2-admin-shadcn-spa-phase2/SPEC.md` | 2026-04-17 | Merged via PR #66; `/admin/*` is now owned by the gateway + admin SPA, visual evidence is captured, and the obsolete Next admin page layer was removed during closeout. |
| cbwu4 | Next runtime reduction after admin SPA migration | done | `cbwu4-next-runtime-reduction/SPEC.md` | 2026-04-17 | Follow up from 8amg2 by freezing the remaining legacy Next ownership, admin preview contract, memos `/api/trpc` residue, and the migration order for shrinking the internal Next runtime. |
| xswab | `/posts` body-image cover fallback | 已完成 | `xswab-posts-cover-fallback/SPEC.md` | 2026-04-21 | Shared Astro cover extraction now falls back to the first body image for `/posts`, related posts still block external covers, and visual evidence is stored in-spec. |
