# Specs Overview

`docs/specs/` is the canonical catalog for topic-level executable specifications. Every topic uses a stable lowercase kebab-case directory and contains `SPEC.md`, `IMPLEMENTATION.md`, and `HISTORY.md`.

## Lifecycle

- `active`: the topic remains current.
- `superseded`: a successor owns the current contract.
- `archived`: the topic is retained for historical reference.

## Implementation

- `in progress`: implementation or verification remains open.
- `implemented`: the documented behavior and verification are complete.

## Index

| Topic | Lifecycle | Implementation | Spec | Successor | Notes |
|---|---|---|---|---|---|
| Admin LLM settings + model catalog | active | implemented | `admin-llm-settings/SPEC.md` | - | Durable admin-managed chat, embedding, and rerank configuration with encrypted secrets and model catalog fallback. |
| Admin shadcn SPA + `/admin/*` ownership migration | archived | implemented | `admin-shadcn-spa-phase2/SPEC.md` | - | PR #66 moved `/admin/*` ownership to the gateway and admin SPA. |
| Admin Soft UI redesign | active | in progress | `admin-soft-ui-redesign/SPEC.md` | - | Soft UI tokens, local primitives, responsive workspace behavior, and stable visual evidence. |
| Astro public frontend migration + single-image transition | archived | implemented | `astro-front-phase1/SPEC.md` | - | Public routes moved to Astro while preserving the transitional single-image runtime. |
| Content relative paths | archived | implemented | `content-relative-paths/SPEC.md` | - | Persisted content uses relative asset paths resolved through current runtime facades. |
| Development service management | archived | implemented | `devctl-service-manager/SPEC.md` | - | Current development services are consolidated behind `bun run dev`. |
| Full direct dependency upgrade to latest | archived | implemented | `deps-update-latest/SPEC.md` | - | Legacy plan `0004` and the later direct-latest upgrade are consolidated here. |
| Local memo root keeps `Memos` case | active | implemented | `local-memos-root-case/SPEC.md` | - | Local memo paths preserve canonical case and strict path safety. |
| Local content source uses real directory layout | active | in progress | `local-real-content-layout/SPEC.md` | - | Configured real roots drive scanning, classification, and admin browsing. |
| Inline Memo admin view | active | implemented | `memo-admin-inline-view/SPEC.md` | - | Build, lint, HTTP/title tests, seven Storybook states, and ten targeted admin/guest browser cases pass; eight owner-approved visual captures are stored. Current-candidate Tier 3 review and PR/required-CI remain open. |
| Memo title semantics | active | implemented | `memo-title-semantics/SPEC.md` | - | Optional memo titles resolve from approved metadata/headings and stay nullable in the public model. |
| Memos Markdown theme contrast | archived | implemented | `memos-content-contrast/SPEC.md` | - | Semantic theme colors keep Memo Markdown readable across supported themes. |
| Nature frontend redesign without DaisyUI | active | in progress | `nature-front-ui/SPEC.md` | - | Public styling uses the Nature design system; runtime-cell Tooltip and touch inspection are implemented, while native-device evidence and delivery gates remain open. |
| Next runtime reduction after admin SPA migration | superseded | implemented | `next-runtime-reduction/SPEC.md` | `zero-next-cleanup/SPEC.md` | Production runtime reduction completed; repository-wide removal moved to the successor. |
| Posts cover fallback | active | implemented | `posts-cover-fallback/SPEC.md` | - | Post cards fall back to the first supported body image. |
| Posts list title contrast | archived | implemented | `posts-list-title-contrast/SPEC.md` | - | Semantic title colors preserve hierarchy across themes. |
| Public Blog Logo Assets and Online-First PWA | active | implemented | `public-pwa/SPEC.md` | - | Approved brand source, generated browser/install icons, public-only install metadata, and online-first caching. |
| Manual version release | active | partial | `manual-version-release/SPEC.md` | - | Static frontend and full-function Docker image share product-semver-v1 identity; prerelease allocation and publication-only completion are implemented in the candidate, full platform validation and real alpha acceptance remain pending. |
| Public media assets facade | active | implemented | `public-media-assets-facade/SPEC.md` | - | Public media references use blog-owned stable facade URLs. |
| Release failure Oidrune alerts | active | in progress | `release-failure-telegram-alerts/SPEC.md` | - | OIDC-authenticated Oidrune handoff with original product-release failure identity; live notification acceptance remains pending. |
| Remote MCP reimplementation | active | implemented | `remote-mcp/SPEC.md` | - | `/mcp` uses current Streamable HTTP sessions and durable content-origin metadata. |
| Search syntax parsing and SQLite FTS5 fallback | active | implemented | `search-full-text-fallback/SPEC.md` | - | Controlled advanced syntax and SQLite FTS5 preserve search when AI providers are unavailable. |
| Three search modes and reliable keyword fallback | active | in progress | `search-relevance/SPEC.md` | - | Article/Memo modes are implemented; unified Playbook coverage, cross-source relevance, global capacity, scoped filtering and version metadata remain unimplemented. |
| Zero Next cleanup | active | in progress | `zero-next-cleanup/SPEC.md` | - | Removes remaining Next ownership while preserving Astro, admin SPA, gateway, and MCP behavior. |
| Style Playbook integration | active | in progress | `style-playbook-integration/SPEC.md` | - | Native reading and static publication remain separate from the new GitHub-only dynamic source contract; database snapshot adoption and administrator-only sync status still require implementation. |
| Worktree bootstrap environment recovery | active | implemented | `worktree-bootstrap-env-recovery/SPEC.md` | - | Copies a missing linked-worktree `.env.local` from the primary worktree, preserves existing target overrides, and re-leases only worktree ports. |
| Project native tag discovery | active | implemented | `project-tag-discovery/SPEC.md` | - | Shared article, Memo and catalog project classification. |
| Web Demo global Inspector controls | active | partial | `web-demo-global-controls/SPEC.md` | - | Shared identity, connectivity, delay, theme and motion controls are implemented. Full public-page CSR is a separate follow-up; Agent VM build/E2E remains pending. |
| Memo clipping workflow | active | in progress | `memo-clipping/SPEC.md` | - | Memo-tagged URL clipping with durable article processing, source Markdown, translation, private conversation, and responsive reading surfaces; runtime and UI implemented locally, empirical and delivery gates remain open. |
| Public first document and CSR navigation | active | in progress | `public-csr-navigation/SPEC.md` | - | Shared SSR/CSR renderer implemented; local navigation, responsive, artifact and owner visual acceptance passed; PR review and CI pending. |
| System Share Memos | active | partial | `system-share-memos/SPEC.md` | - | Console PWA system-share ingestion, URL-to-clipping classification, local unauthenticated storage, atomic attachments, idempotent recovery, global publish feedback, and detail navigation are implemented; mobile density, full-width form layout, attachment-region touch scrolling, real installed-PWA acceptance, and final delivery gates remain. |
| GitHub reader login and public comments | active | implemented | `github-reader-comments/SPEC.md` | - | GitHub reader identity, article/Memo/project comments, review before publication, soft deletion and recovery, responsive comment areas, and Web Demo coverage; real GitHub OAuth acceptance remains environment-dependent. |
