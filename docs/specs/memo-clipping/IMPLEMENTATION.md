# Memo Clipping Workflow Implementation

> The normative contract is in [SPEC.md](./SPEC.md). This file records implementation coverage and rollout facts.

## Current Status

- Implementation: in progress; business workflow, API, publication projection, and responsive UI are implemented locally.
- Lifecycle: active.
- Delivery: no PR has been published. Formal review and merge readiness remain gated by empirical acceptance and owner-confirmed visual evidence.

## Implementation Coverage

- `src/lib/memo-clipping.ts` recognizes only authored tags and the first eligible input line, preserving the author draft separately from the reading projection.
- `src/server/clipping/` owns extraction, private artifacts, lifecycle reconciliation, version restoration, creator authorization, and the application-owned Pi facade. Pi AI, Chord, and Pi Durable are pinned to `1.0.2`.
- The Bun SQLite adapter passes Pi's storage conformance suite and enforces a single owner with lease/epoch fencing. Durable input, tool execution, conversation reopen, and a real subprocess SIGKILL/restart are covered by automated tests.
- UI, REST/tRPC, MCP, and filesystem sync share recognition and reconciliation. Startup repairs indices from authored references and canonical manifests. Notes-only edits do not restart the workflow; target replacement separates conversations and fences stale results.
- The extractor performs DNS/IP checks on every redirect, pins the connection address, limits redirects/time/decoded bytes, and never executes page scripts or loads child resources. Markdown retains headings, tables, links, and literal code.
- Summary is committed before translation. Translation segments and progress persist separately; failed reprocessing retains the last successful set of materials. Pi's persisted retry policy allows three transient model retries; provider-layer retries are disabled to avoid multiplying the budget. Fetch retries are independently bounded to three.
- Public reading, lists, timeline, feed, and snapshots use a composed reading projection. Public responses omit creator proofs, conversations, runtime events, and diagnostics. Private visibility is checked against the authored file as well as the index. Managed standalone article exports are removed when no longer public.
- `ClippingDetail` supports original/translation switching, current/previous material warnings, progress, private version history, and durable discussion snapshots. At 1024px it uses two columns; narrower views use Vaul/Radix bottom sheets with retained draft/scroll and focus restoration.

## Verification

- Shared testbox clipping core: 73 tests passed, including storage conformance, restart recovery, model retry, stale capture, permissions, export cleanup, and index rebuild. The complete workflow also passes an OS-level SIGKILL during translation: it waits for the real 30-second owner lease, resumes saved segments, and commits the summary/capture only once.
- Shared Storybook build passed. Fourteen browser scenarios passed at 320, 360, 375, 393, 768, 1024, and 1440px, including light/dark themes, visitor boundaries, translation failure, old material fallback, and mobile drawer interaction. Playwright 1.63 ran against the validation image's installed Chromium; downloading its newer bundled browser was unavailable due to CDN TLS resets.
- Static site, admin, production console, and backend distribution builds passed on the shared testbox. The full repository suite passed with 834 tests before the additional Pi/application database symlink guard; the final signed-off commit hook validates the current files again.
- Real external extraction of `https://earendil.com/posts/pi-durable/` succeeded: 33,301 Markdown characters, including the opening, code examples, and closing FAQ; no extraction warning. Actual model preflight is blocked: the available environment key is rejected by the default OpenAI endpoint with `401 invalid_api_key`. Mock-model tests do not satisfy real-provider acceptance. Valid project model configuration and current-Candidate empirical evidence are required.
- Production-console browser coverage passed at 320, 360, 375, 393, and 768px, plus desktop column geometry, source/translation switching, session authentication, retained drawer draft/focus, and guest API boundaries. It uses saved deterministic materials and makes no model calls or screenshots. Run `bun run test:clipping-console` after building the console/admin against an isolated test database; `CLIPPING_BROWSER_EXECUTABLE` can select an installed Chromium.
- The admin Tailwind source list explicitly includes the shared clipping reader/drawer. Floating discussion triggers are portalled outside layout containers; safe-area placement has an explicit CSS fallback.
- Visual evidence is not yet accepted. Formal review must not begin until the remaining readiness gates are satisfied.

## Storage and Deployment

- The application Markdown and managed clipping version files are canonical business content. Application SQLite tables `memo_clippings` and `memo_clipping_versions` are rebuildable indices; migration `0011_memo_clipping.sql` adds them without changing ordinary memo rows.
- `PI_DURABLE_DB_PATH` defaults to `pi-durable.sqlite` beside `DB_PATH`; `CLIPPING_CONTENT_BASE_PATH` defaults to the sibling `clippings/` directory. Both must be on persistent storage outside `LOCAL_CONTENT_BASE_PATH`; the Pi database must differ from the application database.
- Each clipping directory contains `manifest.json`, version directories with `source.md`, `summary.md`, `translation.md`, and numbered translation segments. Atomic writes and target revisions prevent partial publication and stale task writes.
- `identity.key` is a private 0600 HMAC key in the clipping storage root. Trusted create paths sign `[memoId, clippingId, creatorId]`; copied or edited references cannot forge the creator. Unverified filesystem imports allow administrator-only discussion.
- Back up authored Markdown, the entire managed clipping directory **including `identity.key`**, the application database, and the Pi database together while the processor is stopped. Restoring only the index cannot recover conversation state. Restore the same directories/configuration before starting the sole runtime owner.
- Production `start-console` and development `start-gateway` own runtime startup/shutdown. Page rendering, sync-only scripts, and build/export processes never start a Pi owner. Heartbeat is 10 seconds; lease is 30 seconds. A second live owner fails startup; after a crash wait for lease expiry before restarting.
- Default clipping concurrency is two. Existing LLM chat settings supply the provider, model, endpoint, and secret. Secrets are resolved dynamically and are not stored in Pi conversation configuration.
- `CLIPPING_PROCESSOR_ENABLED=false` is the rollback switch. It stops accepting processing/actions while preserving authored input and previously saved reading materials. No automatic publication or deployment is performed.

## Operations and Troubleshooting

- Invalid first-line links save successfully and show a correction prompt. Fix the authored link/tag or use reprocess after correcting model configuration.
- Unsupported HTML, private destinations, redirect loops, timeouts, oversize payloads, or insufficient extraction produce explicit failure/partial states. Login, CAPTCHA, PDF/OCR, and JavaScript-only pages are unsupported.
- Version restore uses a matched source/summary/translation set. Replacing a target with a historical source requires explicit replacement; existing target discussion becomes historical. Same-target restore retains its discussion.
- SSE delivers persistent snapshots and partial output; reconnect reads the snapshot again. Server identity and permissions are checked for every private event. Full articles are fetched only for detail/history, not list payloads.
- The opt-in `scripts/clipping-empirical.ts` runner uses a private acceptance directory. `--extract-only` saves a private source artifact without calling a model; `--probe` checks the actual page and provider; the full run requires `CANDIDATE_SHA` and records the source hash, segment coverage, configured model, and cited answer. Do not publish its private working database or credentials.

## Remaining Gates

- Complete current-source full-suite checks, builds, fault recovery, and delivery evidence.
- Supply valid actual model settings and complete SHA-bound article/translation/chat/interruption acceptance.
- Capture, show, and obtain owner confirmation of current UI evidence; then execute the required runtime review lanes and direct PR delivery gates.

## References

- [Requirements contract](./SPEC.md)
- [Topic history](./HISTORY.md)
- [Content and conversation boundaries](../../adr/0012-memo-clipping-content-boundaries.md)

- Existing runtime configuration guidance remains applicable: [LLM settings runtime configuration](../../solutions/admin/llm-settings-runtime-config.md).
