---
status: accepted
---

# Share Native Tag Discovery Across Articles, Memos, and Curated Projects

Project classification tags need to lead into the blog's existing tag discovery surface. Keep the repository-owned project catalog as the source of project identity and tag assignments, and compose it with the eligible article and Memo records into one tag directory. The existing tag metadata owns grouping and icons; it does not become a second source of project tag assignments. This preserves the catalog/body boundary from ADR 0001 while making project-only tags discoverable through native tag routes.

## Scope and Authorization

The accepted scope is locked to the canonical tag assignments, native tag discovery integration, separate project and dated-content sections, association-count rules, metadata management, static/console read boundaries, and acceptance conditions recorded in this ADR. Changes to these decisions require explicit owner confirmation.

Design acceptance does not authorize implementation. Implementation requires a separate, explicit owner instruction.

## Read Model

- Extract the project catalog data into a shared module without page, URL, snapshot, or database dependencies. Site helpers continue to supply project routes, canonical URLs, and related reading.
- Use one pure tag aggregation rule for public snapshots, console rendering, administrator discovery, and tag-list consumers. Public inputs contain only publishable articles, public Memos, and catalog projects; administrator inputs may include unpublished content under the existing authorization rules.
- A directory item has its canonical tag path, path segments, `postCount`, `memoCount`, `projectCount`, and the total `count`. A content entity counts once per tag, including when several of its assigned descendant tags match the same ancestor. Generate the required ancestor routes and apply the same matching rule to counts and results. Counts are calculated from eligible associations, not the metadata table's redundant counters.
- Preserve the existing hierarchical path convention and segment-encoded native URLs. English project tags use intentional canonical spellings, preserving case and punctuation such as spaces, `+`, and `²`; compatibility normalization must not turn `I²C` into `I2C` or silently merge distinct tags. A literal slash in a technology name needs an explicit naming decision before publication; it must not accidentally create a hierarchy or depend on encoded slashes blocked by the deployment path. Project tags are structured assignments; this work does not extend the Memo inline hashtag grammar.
- Compose the tag directory with the current build's project catalog when reading a static content bundle as well as when exporting content locally. A reused article/Memo snapshot must not retain obsolete project assignments or omit tags newly added to the catalog.
- Keep the dated article/Memo timeline separate from the undated project associations. Tag detail shows related projects in catalog order before the existing chronological article/Memo stream. A snapshot's `projectsByTag` holds project slug references; presentation resolves them against the current catalog. The timeline API adds a sibling `projects` collection containing project identity, title, summary, domain, tags, and detail path, while retaining its dated `items`, `nextCursor`, and `hasMore` semantics. The complete project collection is independent of timeline pagination.
- Tag RSS remains a dated article/Memo feed. A project-only tag may have a valid empty feed; project catalog entries do not acquire invented publication dates.

## Reader and Administrator Behavior

Project-detail tags and the tags already visible on homepage project cards use the shared native tag-link component, icon resolution, runtime base-path helper, keyboard focus behavior, and responsive hit targets. Project details expose all approved classifications; the homepage retains its compact two-tag presentation, selected from technology-stack tags rather than whichever discovery subject comes first in the full list.

For example, clicking `React` on a project detail opens the native `React` tag detail, whose project section includes that project and every other eligible React project. Its article/Memo section displays the eligible dated content with the same tag. A `Harness` detail still shows its projects when there are no dated entries. A tag tile's per-type counts match these associations and its total is their sum.

The public tag index includes project-only and Memo-only tags, shows per-type association counts instead of calling every result an article, and links every item to a generated tag detail. Existing metadata supplies grouping and icons; unassigned tags remain discoverable under `Other` with the standard hash fallback. Public exports restrict tag names, counts, and metadata references to the eligible public directory. Administrator tag overview, organizer validation, AI organizer input, and icon overview share the expanded directory so project-only tags can use the existing management tools. Reading the directory does not persist metadata or run the AI organizer. Removed project assignments disappear from public discovery when no other eligible entity uses the tag; metadata persistence does not keep an unused tag alive.

## Considered Options

- **Only make the current chips links**: project-only tags would still lack native static routes, counts, project results, and administrator discovery.
- **Copy projects into the article table**: this creates competing sources of project identity and tag assignments, introduces content synchronization ownership, and gives undated project cases article semantics.
- **Mix projects into the chronological timeline**: this requires a genuine date policy plus changes to item types, sorting, pagination, media, and feed contracts. The separate project collection avoids inventing those semantics.
- **Treat every slash in a project technology name as a hierarchy**: this produces classifications such as `GATT` beneath `BLE` and `DC` beneath `Isolated DC`, even though the approved names refer to single technologies or approaches.

## Canonical Project Tag Names

Project classifications use English names for technology stacks, key engineering approaches, and relevant discovery subjects. `AI`, `Agent`, and `Harness` apply when the project's capabilities or workflow relate to those subjects. Feature descriptions without useful classification value are excluded. `Menu Bar App` is the canonical English label for the SpotiBind application form.

The following compatible spellings are approved. Each represents one flat classification in the native tag system; the slash convention remains available for intentional tag hierarchies elsewhere.

| Technology spelling | Canonical tag name |
| --- | --- |
| USB-C PD/PPS | USB-C PD + PPS |
| Isolated DC/DC | Isolated DC-DC |
| BLE/GATT | BLE GATT |
| USB/Serial | USB Serial |
| HTTP/2 Mesh | HTTP2 Mesh |

The approved replacement assignments are:

| Project | Classification tags |
| --- | --- |
| Codex Vibe Monitor | AI, Agent, OpenAI-Compatible API, LLM Observability, Rust, Axum, Tokio, SQLx, SQLite, React, SSE, PWA |
| Tavily Hikari | AI, Agent, MCP, Tavily API, Rust, Axum, Tokio, SQLx, SQLite, React, TanStack Router, PWA |
| KaisouMail | AI, Cloudflare Workers, Workers AI, Cloudflare Pages, Hono, D1, R2, Email Routing, React, TypeScript |
| OctoRill | AI, LLM API, GitHub API, GitHub OAuth, Rust, React, Vite, SQLite |
| PastePreset | React, TypeScript, Vite, Bun, PWA, Web Worker, OffscreenCanvas, Tailwind CSS |
| SpotiBind | Swift, macOS, Event Tap API, Accessibility API, Menu Bar App |
| Ivan's Blog | Astro, React, Bun, TypeScript, SQLite, Drizzle ORM, MCP, FTS5, Semantic Search, AI, Agent |
| LoadLynx | Rust, Embassy, esp-hal, STM32G431, ESP32-S3, Dual-MCU, UART, CBOR, SLIP, USB CDC, Agent, Harness |
| Mains Aegis | Rust no_std, esp-hal, ESP32-S3, UPS, BMS, USB-C PD + PPS, BQ40Z50-R2, BQ25792, TPS55288, INA3221, TMP112A, Agent, Harness |
| IsolaPurr USB Hub | Rust no_std, ESP32-S3, CH334P, CH224Q, TPS55288, USB Data Isolation, Isolated DC-DC, Tauri, React, Agent, Harness |
| Tuckmark | Agent, Harness, MCP, TypeScript, Rust, BLE GATT, DEVD IPC, Schema-Driven Templates |
| Flux Purr | Rust, ESP32-S3, React, TypeScript, USB Serial, Native IPC, LAN HTTP, EEPROM, Agent, Harness |
| IsolaRail | Rust, ESP32-S3, CH335F, M24C64 EEPROM, USB JSONL, Native IPC, LAN HTTP, I²C, Overcurrent Protection |
| XP | Rust, OpenRaft, Xray gRPC, HTTP2 Mesh, VLESS + REALITY, Shadowsocks 2022, React, PWA, Docker, Cloudflare Tunnel |
| Dockrev | Rust, Tokio, Axum, tracing, Docker Engine API, Docker Compose, React, TypeScript, Vite, Supervisor |
| Oidrune | Cloudflare Workers, GitHub Actions, GitHub OIDC, Telegram, Hono, TypeScript, Bun, D1, Queues, Cloudflare Access |

## Acceptance Evidence

- All 16 catalog projects receive the approved tag sets and use English labels.
- Every visible project tag resolves to its native detail route, including project-only tags, tags containing spaces or `+`, and `I²C`, on static and console targets and under a configured public base path.
- A shared tag returns each associated project, article, and Memo once; public counts equal the displayed eligible associations, and ancestors use the same descendant rule. Private, draft, or unpublishable content does not enter public discovery.
- Reusing an article/Memo content bundle while changing catalog tags produces routes and associations from the current catalog, with no stale project results.
- Project-only tags appear in public discovery, organizer validation, and icon management. Grouping or icon edits never rewrite catalog assignments or require a second project source.
- A project-only tag renders its project section without a misleading whole-page empty state. Article/Memo feeds and timeline pagination retain their dated behavior.
- Long labels wrap without horizontal page overflow; project tag links meet the Nature UI keyboard, light/dark, and desktop/mobile hit-target contracts.
