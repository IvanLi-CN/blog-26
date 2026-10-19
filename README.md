<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/IvanLi-CN/blog-26/releases"><img src="https://img.shields.io/github/v/release/IvanLi-CN/blog-26?display_name=tag&label=release&style=flat-square" alt="Latest release" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/ci.yml?branch=main&label=ci&style=flat-square" alt="CI status on main" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/e2e.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/e2e.yml?branch=main&label=e2e&style=flat-square" alt="E2E status on main" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/package.json"><img src="https://img.shields.io/badge/Bun-%5E1.0.0-f9f1e1?logo=bun&logoColor=000000&style=flat-square" alt="Bun runtime requirement" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/Dockerfile"><img src="https://img.shields.io/badge/Docker-image-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker image build" /></a>
</p>

# Ivan's Blog

> A personal knowledge base shared by humans and authorized AI Agents.

Ivan's Blog is an owner-controlled knowledge system for notes, source material, project experience, and reusable rules. People and authorized Agents work from the same records; the blog is one selective publishing surface, not the product boundary.

The owner controls what is kept, who can read or write it, and what becomes public. Human interfaces and Agent tools expose the same knowledge with different interaction models and permissions.

**Status:** `active / partial`. The product vision and the current implementation are documented separately; passing CI does not mean the full shared-knowledge platform or alpha acceptance is complete.

## Product boundary

**Primary users**

- **Knowledge owner:** records and curates knowledge, grants access, and decides what can be published.
- **Human readers and collaborators:** read, search, cite, and maintain knowledge within their permissions.
- **Authorized Agents:** retrieve applicable knowledge, cite its basis, and contribute updates within granted scope.
- **Maintainers:** keep content, permissions, synchronization, retrieval, and recovery understandable and operable.

**What this project is not:** a default multi-tenant SaaS, an enterprise knowledge-governance suite, or a general chat product. Agent access does not make private content public, and a saved record does not have to become a published article.

<table align="center" border="0" cellpadding="18" cellspacing="0">
  <tr>
    <td align="center" bgcolor="#f3f0e8">
      <a href="./site/assets/brand/source/ivan-blog-mark.svg"><img src="./site/assets/brand/source/ivan-blog-mark.svg" width="104" alt="Ivan's Blog canonical product mark" /></a>
    </td>
  </tr>
</table>

<p align="center"><strong>One knowledge base for people and Agents.</strong></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./site/assets/projects/social-source/blog-26-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="./site/assets/projects/social-source/blog-26-light.png" />
    <img src="./site/assets/projects/social-source/blog-26-light.png" width="100%" alt="Ivan's Blog shared knowledge base for humans and AI Agents" />
  </picture>
</p>

## Product surface

- **Capture and organize:** maintain Posts, Memos, Projects, Tags, source material, and reusable Playbook rules in the local Markdown content root.
- **Search and cite:** combine keyword, full-text, and available AI retrieval while retaining visibility, source, and fallback boundaries.
- **Read and publish selectively:** expose chosen Posts, Memos, projects, Playbook entries, and RSS content; private records remain private unless the owner publishes them.
- **Connect authorized Agents:** the remote MCP surface lets an authorized Agent read, search, create, and update content within its granted scope.
- **Process source material:** Memo clipping saves authored input first, then runs summary and translation asynchronously while retaining the original source and prior successful version.
- **Manage the system:** the admin console provides editing, preview, comments, scheduled tasks, access tokens, AI configuration, and content-sync controls.

Shared knowledge is not automatically public. Reading, writing, Agent access, and publication are separate decisions.

## Knowledge loop

1. A person records a note, source, project decision, or reusable rule in the knowledge base.
2. An authorized Agent retrieves the relevant record, cites its basis, and applies it to a task.
3. A new understanding or correction can return as a distinguishable Agent contribution for the owner to review and maintain.
4. The owner decides whether the maintained record remains private or becomes a public Post, Memo, project, or Playbook entry.

## Quick Start

The repository uses Bun `^1.0.0`; the Astro CLI requires Node.js 22.12 or newer. `bun run setup` installs the checkout hooks, creates the local environment entry point when missing, leases worktree-local ports, and prepares development data.

### Deterministic Web Demo

The Web Demo uses shipped application routes, fixtures, mock APIs, and in-memory state. It needs no login, model call, live gateway, or external content source, and its mutations cannot write to a real service.

```bash
bun run setup
bun run web-demo:build
bun run web-demo:preview
```

The public Demo starts at `/memos/`; the admin Demo starts at `/admin/dashboard`. The shared Inspector exposes scene, persona, network, data, simulated actions, share state, and recent in-memory mutations. Demo mode is a separate build artifact and cannot be enabled in the live artifact through a query string or browser storage.

### Local development

```bash
bun run setup
bun run dev-sync:trigger
bun run dev
```

The application reads only the configured local filesystem content root; no remote content-source service is required or started. Use `bun run worktree:bootstrap -- --force` when a linked worktree needs its generated state rebuilt.

## Runtime boundaries

- **Content source:** local Markdown is authoritative; SQLite and generated search indexes are derived projections.
- **Search:** `keyword`, `rewrite`, and `rag` modes preserve keyword hits and fall back directly to keyword search when AI retrieval is unavailable.
- **Memo clipping:** `#剪藏` plus an HTTP(S) target saves authored material before asynchronous processing. States are `queued`, `processing`, `completed`, and `failed`; failed processing preserves authored content and retry never publishes a Memo automatically.
- **Content sync:** administrative repair and rebuild requests return `202 Accepted` after an asynchronous task is durably recorded. The response does not mean indexing is complete; task and status endpoints expose phase, progress, cancellation, and failure. Repair and rebuild are explicit recovery actions, with no implicit delivery retry, downstream delivery state, or dead-letter state in this contract.
- **Delivery surfaces:** the repository ships separate public site, admin, gateway, and full-feature Docker surfaces. Their build and runtime boundaries are not interchangeable.
- **Release delivery:** [Manual Product Release](docs/runbooks/manual-version-release.md) prepares one release identity for the static frontend and full-feature Docker image through a protected `VERSION`-only PR, then publishes the GitHub Release and GHCR image.

## Repository map

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

Page-level evidence uses the official Web Demo routes. Storybook is reserved for reusable components and focused interaction coverage; [quality gates](.github/quality-gates.json) define the required CI and release checks.

## Documentation map

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
