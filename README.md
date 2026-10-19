<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/IvanLi-CN/blog-26/releases"><img src="https://img.shields.io/github/v/release/IvanLi-CN/blog-26?display_name=tag&label=release&style=flat-square" alt="Latest release" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/ci.yml?branch=main&label=ci&style=flat-square" alt="CI status" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/e2e.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/e2e.yml?branch=main&label=e2e&style=flat-square" alt="E2E status" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/package.json"><img src="https://img.shields.io/badge/Bun-%5E1.0.0-f9f1e1?logo=bun&logoColor=000000&style=flat-square" alt="Bun runtime requirement" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/Dockerfile"><img src="https://img.shields.io/badge/Docker-image-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker image build" /></a>
</p>

# Ivan's Blog

Ivan's Blog is a personal knowledge base owned by an individual and shared by humans and authorized AI Agents. It keeps notes, source material, project experience, and reusable rules available across reading, writing, and real work; the blog is one selective publishing surface, not the whole product.

The knowledge owner decides what to keep, who can access it, and what can be published. Humans and Agents use the same knowledge through different interfaces and permissions. This project is not a default multi-tenant SaaS, an enterprise governance product, or a general chat product, and Agent access never makes private content public by default.

The current implementation is `active / partial`; full platform validation and real alpha acceptance remain separate open gates.

Public site: [ivanli.cc](https://ivanli.cc)

<p align="center">
  <a href="./site/assets/brand/source/ivan-blog-mark.svg"><img src="./site/assets/brand/source/ivan-blog-mark.svg" width="128" alt="Ivan's Blog product mark" /></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/projects/social/blog-26-dark-1280.webp" />
    <source media="(prefers-color-scheme: light)" srcset="./public/projects/social/blog-26-light-1280.webp" />
    <img src="./public/projects/social/blog-26-light-1280.webp" width="100%" alt="Ivan's Blog shared knowledge base for humans and AI Agents" />
  </picture>
</p>

## What it does

- **Capture and organize:** keep Posts, Memos, Projects, Tags, source material, and reusable Playbook rules in the local Markdown content root.
- **Search and cite:** combine keyword, full-text, and available AI retrieval while preserving visibility, source, and fallback boundaries.
- **Read and publish selectively:** expose chosen Posts, Memos, projects, and Playbook content through the public site and RSS; private content stays private unless the owner publishes it.
- **Connect authorized Agents:** the remote MCP surface lets an authorized Agent read, search, create, and update content within its granted scope.
- **Process source material:** Memo clipping saves authored input first, then runs summary and translation asynchronously while retaining the original source and prior successful version.
- **Manage the system:** the admin console provides editing, preview, comments, scheduled tasks, access tokens, AI configuration, and content-sync controls.

Shared knowledge is not automatically public. Reading, writing, Agent access, and publication are separate decisions.

## How the knowledge loop works

1. A person records a note, source, project decision, or reusable rule in the knowledge base.
2. An authorized Agent retrieves the relevant record, cites its basis, and applies it to a task.
3. New understanding or a correction can return as a distinguishable Agent contribution for the owner to review and maintain.
4. The owner decides whether the maintained record remains private or becomes a public Post, Memo, project, or Playbook entry.

## Use the deterministic Web Demo

The Web Demo is built from the shipped application routes with fixtures, mock APIs, and in-memory state. It needs no login, model call, live gateway, or external content source, and its mutations cannot write to a real service.

```bash
bun run setup
bun run web-demo:build
bun run web-demo:preview
```

The public Demo starts at `/memos/`; the admin Demo starts at `/admin/dashboard`. Its shared Inspector exposes scene, persona, network, data, simulated actions, share state, and recent in-memory mutations. Demo mode is a separate build artifact and cannot be enabled in the live artifact through a query string or browser storage.

## Local development

The repository uses Bun `^1.0.0` and Node.js 22.12 or newer for the Astro CLI. `bun run setup` bootstraps a checkout or worktree and creates the local environment entry point when it is missing.

```bash
bun run setup
bun run dev-sync:trigger
bun run dev
```

The application reads only the configured local content root; no remote content-source service is required or started. Common local settings are:

```bash
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
CONTENT_SOURCES=local
PORT=<leased gateway port>
SITE_PORT=<leased site port>
ADMIN_PORT=<leased admin port>
```

For a full local build, use `bun run build`; the production console runtime uses `bun run start`. Do not reuse another worktree's ports; `bun run worktree:bootstrap -- --force` repairs a worktree when its generated state needs to be rebuilt.

## Search, clipping, and content sync

Search supports `keyword`, `rewrite`, and `rag` modes. Keyword hits are preserved, and unavailable AI retrieval falls back directly to keyword search. SQLite FTS5 and embedded Tantivy are rebuildable index projections; authoritative local Markdown remains the source of truth.

Memo clipping is triggered by `#剪藏` and an HTTP(S) target URL. The authored material is saved before asynchronous processing begins. Processing reports `queued`, `processing`, `completed`, or `failed`; summary and translation progress are independent, failed processing preserves authored content, and retry never publishes a Memo automatically.

Administrative RAG repair and rebuild requests return `202 Accepted` after an asynchronous content-sync task is durably recorded. `202` does not mean indexing is complete: use the task and status endpoints for phase, progress, cancellation, and failure details. Repair and rebuild are explicit recovery actions; there is no implicit delivery retry, downstream delivery state, or dead-letter state in this task contract. See the [content-sync HTTP contract](docs/specs/style-playbook-integration/contracts/content-sync-status.md).

## Deployment

The runtime uses a local filesystem content root, SQLite, and generated search projections. The repository ships separate public site, admin, gateway, and full-feature Docker surfaces; their build and runtime boundaries are not interchangeable.

## Release delivery

Product releases use [Manual Product Release](docs/runbooks/manual-version-release.md). One release identity covers the static frontend and full-feature Docker image, is prepared through a protected `VERSION`-only PR, and is then published as a GitHub Release and GHCR image. Stable releases can advance the production site after verification; prereleases publish artifacts without advancing the stable site.

## Repository layout

- `site/`: Astro public site and public install surface.
- `apps/admin/`: Vite/React administration SPA.
- `src/server/`: Bun gateway, HTTP API, tRPC, MCP, and content services.
- `src/lib/`: shared models, search, Playbook, version, and runtime libraries.
- `drizzle/`: SQLite migrations and database configuration.
- `site/assets/brand/source/ivan-blog-mark.svg`: canonical README and public brand mark; install-specific PWA variants are derived separately.
- `tests/`: unit, integration, E2E, and reusable component interaction coverage.
- `docs/`: product specs, implementation records, ADRs, contracts, and runbooks.

## Verify changes

```bash
bun run check
bun run test
bun run test:e2e
bun run test:storybook-boundary
```

Page-level evidence uses the official Web Demo routes. Storybook is reserved for reusable components and focused interaction coverage; the [quality gates](.github/quality-gates.json) define the required CI and release checks.

## More docs

- [Product vision and goals](PRODUCT.md): product purpose, users, goals, shared-knowledge constraints, and non-goals.
- [Context](CONTEXT.md) and [Glossary](GLOSSARY.md): stable domain language and public-runtime terminology.
- [Specs index](docs/specs/README.md): spec hierarchy and the roles of `SPEC.md`, `IMPLEMENTATION.md`, and `HISTORY.md`.
- [Remote MCP Spec](docs/specs/remote-mcp/SPEC.md): Agent tools, authentication, and content-operation boundaries.
- [Search Spec](docs/specs/search-relevance/SPEC.md) and [implementation](docs/specs/search-relevance/IMPLEMENTATION.md): search modes, fallback, visibility, and coverage.
- [Unified search HTTP contract](docs/specs/search-relevance/contracts/unified-search.md): request, response, and status semantics for the exposed search contract.
- [Memo clipping Spec](docs/specs/memo-clipping/SPEC.md) and [implementation](docs/specs/memo-clipping/IMPLEMENTATION.md): source capture, summary, translation, discussion, and publication boundaries.
- [Content sync HTTP contract](docs/specs/style-playbook-integration/contracts/content-sync-status.md): asynchronous indexing tasks, progress, cancellation, and terminal states.
- [Public PWA Spec](docs/specs/public-pwa/SPEC.md) and [implementation](docs/specs/public-pwa/IMPLEMENTATION.md): canonical brand source, generated install assets, manifest, and cache boundaries.
- [Style Playbook integration](docs/specs/style-playbook-integration/SPEC.md): public Playbook snapshots, versions, synchronization, and search boundaries.
- [Architecture decisions](docs/adr/): durable technical decisions and trade-offs.
- [Runbooks](docs/runbooks/): release, deployment, synchronization, and recovery procedures.
- [Release contract](.github/release-contract.json): release identity, version policy, and product artifact boundary.
- [Quality gates](.github/quality-gates.json): required checks, branch policy, and gate declarations.

## License

[MIT License](LICENSE)
