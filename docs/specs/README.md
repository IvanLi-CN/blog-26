# Specs Overview

`docs/specs/` is the primary source of truth for executable specs in normal/fast-track flows.
Legacy plans in `docs/plan/` remain readable but are no longer the preferred place for new work.

## Lifecycle

- `active`: the spec is still the current topic-level source of truth.
- `superseded(#<id>)`: the topic moved to a newer spec.
- `archived`: the spec remains for historical reference but is no longer the normative input.

## Implementation

- `in progress`: implementation is ongoing.
- `implemented`: implementation and verification are complete.
- Detailed rollout facts and remaining gaps stay in each spec directory's `IMPLEMENTATION.md`.

## Index

| ID | Title | Lifecycle | Implementation | Spec | Last | Notes |
|---|---|---|---|---|---|---|
| n8ure | Nature frontend redesign without DaisyUI | active | implemented | `n8ure-nature-front-ui/SPEC.md` | 2026-04-12 | Replace public DaisyUI styling with a dedicated Nature design system and stable visual evidence flow; Astro public theme persistence regression fixed. |
| n338y | Release failure Telegram alerts | active | in progress | `n338y-release-failure-telegram-alerts/SPEC.md` | 2026-04-12 | Add a repo-local release failure notifier wrapper, emit explicit release target SHA markers, and keep a manual smoke path for Telegram alert validation. |
| ey3mm | PR + label driven release | active | in progress | `ey3mm-pr-label-release/SPEC.md` | 2026-04-28 | Keep deterministic component releases while publishing a unified frontend/backend/admin Docker image with plain `v*` tags. |
| m4c9u | Local memo root keeps `Memos` case | active | implemented | `m4c9u-local-memos-root-case/SPEC.md` | 2026-03-10 | Keep local memo writes aligned with the synced `Memos` tree, keep active env parsing strict, preserve safe local client fallbacks, and block dot-segment memo roots. |
| mivez | Local content source uses real directory layout | active | in progress | `mivez-local-real-content-layout/SPEC.md` | 2026-03-11 | Remove synthetic local wrapper directories, classify content from configured real roots, and keep admin local browsing aligned with the actual note tree. |
| ejfkn | Full direct dependency upgrade to latest | archived | implemented | `ejfkn-deps-update-latest/SPEC.md` | 2026-04-06 | Migrate legacy deps-update-latest plan into docs/specs, complete the direct latest upgrade, and keep the branch ready for PR convergence. |
| phgpd | Astro public frontend migration + single-image transition | archived | implemented | `phgpd-astro-front-phase1/SPEC.md` | 2026-04-09 | Move the public frontend to Astro, introduce compatibility HTTP APIs, keep single-image deployment with a gateway in front of legacy Next, and close the PR at merge-ready. |
| 8amg2 | Admin shadcn SPA + `/admin/*` ownership migration | archived | implemented | `8amg2-admin-shadcn-spa-phase2/SPEC.md` | 2026-04-17 | Merged via PR #66; `/admin/*` is now owned by the gateway + admin SPA, visual evidence is captured, and the obsolete Next admin page layer was removed during closeout. |
| cbwu4 | Next runtime reduction after admin SPA migration | superseded(#znext) | implemented | `cbwu4-next-runtime-reduction/SPEC.md` | 2026-04-17 | Production runtime reduction is complete; final repository-wide cleanup is owned by `znext`. |
| znext | Zero Next cleanup | active | in progress | `znext-zero-next-cleanup/SPEC.md` | 2026-04-30 | Remove active Next runtime/code/config/dependency ownership while preserving Astro public, admin SPA, gateway API, and MCP behavior. |
| f2zjw | Posts cover fallback | active | implemented | `f2zjw-posts-cover-fallback/SPEC.md` | 2026-04-21 | Restore `/posts` cover fallback from body images without changing snapshot schema. |
| 2dvb9 | Admin LLM settings + model catalog | active | implemented | `2dvb9-admin-llm-settings/SPEC.md` | 2026-04-23 | Add durable admin-managed chat/embedding/rerank configuration, encrypted secret storage, and a reusable model picker with catalog fallback. |
| w5y8y | Remote MCP reimplementation | active | implemented | `w5y8y-remote-mcp/SPEC.md` | 2026-05-12 | Rebuild `/mcp` around current Streamable HTTP sessions, preserve content tools, and mark MCP-created content with durable origin metadata for the local content runtime. |
| sftui | Admin Soft UI redesign | active | in progress | `sftui-admin-soft-ui-redesign/SPEC.md` | 2026-06-01 | Redesign the full admin SPA with Soft UI tokens, local Radix-backed primitives, wide-screen `1440px` workspace, mobile drawer navigation, Storybook coverage, and visual evidence. |
| 2nvkr | Public media assets facade | active | implemented | `2nvkr-public-media-assets-facade/SPEC.md` | 2026-06-10 | Route every public post/memo media reference through a blog-owned assets facade, keep imagorvideo on an internal stable source route, and stop leaking raw file URLs on public surfaces. |
| search-full-text-fallback | Search syntax parsing and SQLite FTS5 fallback | active | in progress | `search-full-text-fallback/SPEC.md` | 2026-08-04 | Parse controlled advanced search syntax with an AST, maintain a SQLite FTS5 trigram index, and preserve useful results when AI search providers are unavailable. |
