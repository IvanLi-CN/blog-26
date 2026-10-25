# Style Playbook publishing

The static blog site may read stable, validated Release assets from the private `IvanLi-CN/style-playbook-skills` repository and publish them independently. The dynamic console reads the configured GitHub ref through the GitHub content source contract and persists current/previous complete snapshots in the database; it never reads the static site, its pointer, or its Release assets. The Blog export path does not rewrite or sanitize shared Playbook prose. Visitors never receive source credentials, and dynamic source credentials remain server-only.

## Activation

Production activation is separate from implementation. Store the server-only GitHub read credential as `STYLE_PLAYBOOK_GITHUB_TOKEN`, scoped to `Contents: read` on `style-playbook-skills`. `STYLE_PLAYBOOK_GITHUB_REPOSITORY` defaults to `IvanLi-CN/style-playbook-skills` and `STYLE_PLAYBOOK_GITHUB_REF` defaults to `main`; both may be configured. A missing token is `unconfigured`. The static publication workflow may also use this credential for its own Release contract and may keep a separate `PLAYBOOK_SUPPLEMENT_SYNC_TOKEN` for the protected static-publication receiver. `PLAYBOOK_SOURCE_TOKEN`, `GH_TOKEN`, and `PLAYBOOK_SYNC_ENABLED` are not dynamic provider configuration.

Use a stable upstream Release with both public assets and an archive matching [the public package contract](../specs/style-playbook-integration/contracts/public-package.md) only for the independent static site. The dynamic console does not require a Release ID or public pointer; it resolves the configured branch, tag or commit and validates the fixed public export at that commit. The first dynamic check may seed the database only when no valid current snapshot exists; later checks preserve current on failure.

Static frontend/backend publication may continue to carry its validated archive through the existing production lock, but that artifact is not the dynamic console's source. The dynamic service checks GitHub at startup and every 300 seconds by default, and administrators may trigger an asynchronous check. Public requests use the adopted database snapshot and never wait for GitHub. Verify the static site and the dynamic console separately; a static pointer is not evidence of the dynamic current snapshot.

## Update and retry

The static publication workflow checks its upstream Release on its own schedule. The dynamic service resolves `STYLE_PLAYBOOK_GITHUB_REF`, reads one commit's fixed public export, and compares the resolved commit SHA and normalized content hash with the adopted database snapshot. A same-content new commit updates provenance without rebuilding content or indexes; a changed content hash requires full validation and atomic content/keyword adoption, followed by asynchronous RAG preparation. GitHub request failures are `failed`; malformed or private candidates are `invalid`; missing credentials are `unconfigured`.

Static publication continues to use its own production lock and package checks. Dynamic checks use one active task per source with an owner token, lease, bounded transient retries and durable outcomes; a late task cannot overwrite a newer adoption. A failed dynamic check leaves current readable and does not alter static deployment.

## Explicit rollback

Dynamic rollback is not an automatic synchronization outcome. To perform a controlled rollback, an operator changes `STYLE_PLAYBOOK_GITHUB_REF` to an explicit tag or commit, then runs the normal administrator/source check and verifies the resolved source identity and adopted snapshot. Ordinary checks do not select an older database snapshot. Static-site rollback remains a separate Release/publication operation governed by the static package contract.

Verify the static publication identity in its own deployment record and the dynamic `current` source revision/content hash in administrator status. A later check of the configured ref may intentionally move the dynamic service forward again; no static pointer or Release status controls that decision.

## Console and local validation

The dynamic contract persists current and previous complete snapshots in the database. It starts a check immediately, polls every 300 seconds by default, and exposes manual checks only to administrators. No page request fetches GitHub. A missing token, incompatible export or failed request preserves current; no valid current snapshot affects only the Playbook surface. The static supplement receiver and any file cache used by the static publication path remain separate from dynamic source adoption.

For an offline fixture build, run `bun tests/lib/playbook-fixture.ts`, set `PLAYBOOK_BUNDLE_DIR` to that output, set `DB_PATH` and `LOCAL_CONTENT_BASE_PATH` to controlled local data, and run `bun run site:build`. `bun scripts/verify-playbook-artifact.ts` checks page/data/resource identity. Console and static builds can be checked together with `bun tests/lib/playbook-build-smoke.ts` after both artifacts are built. Heavy builds/regression/E2E work runs on codex-testbox under the repository's shared-testbox policy.

## Content and RAG recovery

After applying forward migration 0015, console reconstructs current/previous manifests and durable unfinished jobs before starting polling. Content adoption does not wait for embedding, and startup repair uses only adopted public snapshots and current public blog content. Do not delete old vector rows or infer orphan ownership from slugs. Earlier sync counts and adoption timestamps are unknown unless an atomic task checkpoint exists.

The admin status endpoint separates collection totals from public RAG content/chunk coverage. For retained production vectors without configuration provenance, expect outdated targets; an empty Playbook projection still has an expected unindexed total. This code upgrade does not prove production data has been repaired. Read the actual status first, then explicitly authorize a production `repair` task for blog, Playbook or both. Repair preserves valid chunks and old compatible storage, returns durable task IDs and can be cancelled per task. A rebuild is a separate explicit operation covering every selected target.

Validate recovery by comparing the same scope/edition/configuration identity before and after repair. Content and chunk totals must each equal indexed + unindexed + outdated + failed; complete parents require all expected chunks. Check durable task progress and controlled errors, then confirm modern RAG no longer reports that source as incomplete. Provider failure preserves adopted keyword content. Cancellation preserves successful chunks, and explicit retry or a changed target is required for cancelled manifests. No status GET or ordinary search starts this work. Deployment, production repair and TLS investigation require their own operation scope.
