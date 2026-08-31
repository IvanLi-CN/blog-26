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
| Memos Markdown theme contrast | archived | implemented | `memos-content-contrast/SPEC.md` | - | Semantic theme colors keep Memo Markdown readable across supported themes. |
| Nature frontend redesign without DaisyUI | active | implemented | `nature-front-ui/SPEC.md` | - | Public styling uses the Nature design system with responsive and visual evidence contracts. |
| Next runtime reduction after admin SPA migration | superseded | implemented | `next-runtime-reduction/SPEC.md` | `zero-next-cleanup/SPEC.md` | Production runtime reduction completed; repository-wide removal moved to the successor. |
| Posts cover fallback | active | implemented | `posts-cover-fallback/SPEC.md` | - | Post cards fall back to the first supported body image. |
| Posts list title contrast | archived | implemented | `posts-list-title-contrast/SPEC.md` | - | Semantic title colors preserve hierarchy across themes. |
| PR + label driven release | active | in progress | `pr-label-release/SPEC.md` | - | Component-aware releases publish frontend, backend, Pages, and a unified image. |
| Public media assets facade | active | implemented | `public-media-assets-facade/SPEC.md` | - | Public media references use blog-owned stable facade URLs. |
| Release failure Oidrune alerts | active | in progress | `release-failure-telegram-alerts/SPEC.md` | - | Release failures report the actual target SHA through the OIDC-authenticated Oidrune workflow. |
| Remote MCP reimplementation | active | implemented | `remote-mcp/SPEC.md` | - | `/mcp` uses current Streamable HTTP sessions and durable content-origin metadata. |
| Search syntax parsing and SQLite FTS5 fallback | active | implemented | `search-full-text-fallback/SPEC.md` | - | Controlled advanced syntax and SQLite FTS5 preserve search when AI providers are unavailable. |
| Zero Next cleanup | active | in progress | `zero-next-cleanup/SPEC.md` | - | Removes remaining Next ownership while preserving Astro, admin SPA, gateway, and MCP behavior. |
