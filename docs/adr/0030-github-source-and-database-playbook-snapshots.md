---
status: accepted
---

# Use GitHub as the dynamic Playbook source and retain adopted snapshots in the database

The static public site and the dynamic console have different freshness and availability boundaries. The static site may continue to publish its own validated public artifact, but the dynamic service must not read the static site or use its deployed pointer as a content source. The previous Release-following design also made the runtime source depend on publication timing and introduced a larger identity model than the dynamic service needs.

## Decision

- The dynamic service has one configured source today: the GitHub repository `IvanLi-CN/style-playbook-skills`. `STYLE_PLAYBOOK_GITHUB_REPOSITORY` defaults to that repository, `STYLE_PLAYBOOK_GITHUB_REF` defaults to `main`, and `STYLE_PLAYBOOK_GITHUB_TOKEN` is the server-only read credential. A missing token is `unconfigured`; `PLAYBOOK_SOURCE_TOKEN`, `GH_TOKEN`, and `PLAYBOOK_SYNC_ENABLED` are not provider configuration names.
- A configured ref may be a branch, tag, or commit. The provider resolves it to one commit SHA and reads the fixed public export at that commit. It does not scan an arbitrary repository tree, read a static-site deployment, use Release assets, mix files from different commits, or expose private source material.
- The source revision is the resolved commit SHA. The content snapshot hash is calculated from the complete normalized public snapshot, including catalog, bodies, public resources, and search documents. A same-commit/different-hash candidate is stale and must be revalidated before adoption; it is invalid only when structure, public-boundary, or internal digest validation fails. A different commit with the same content hash updates source provenance without rebuilding content or search projections; a different commit with different content is a new candidate.
- The database persists the current and previous complete adopted snapshots. A failed or invalid candidate never replaces the current snapshot, and ordinary synchronization never selects an older database snapshot or performs an automatic downgrade. A seed is used only when no valid current database snapshot exists.
- Synchronization runs at startup, on a configurable background interval with a five-minute default, and through an administrator-triggered asynchronous check. Public requests use the adopted database snapshot and never wait for or directly call GitHub. One logical source has at most one active task, with a lease, execution ownership, bounded transient retries, and durable outcomes.
- Content validation and keyword projection must complete before an atomic adoption of the complete snapshot. RAG preparation is asynchronous and independent; incomplete or failed semantic coverage does not make the adopted content unreadable. Synchronization state and semantic coverage warnings are administrator-only.
- The current provider boundary is intentionally small. A future provider may return the same normalized snapshot, source revision, content hash, and observable failure state, but the database retention layer is not a provider and the static site is not a provider.

## Consequences

The console can remain readable during GitHub outages and can report the exact adopted source revision without coupling request rendering to an external service. A rewritten `main` is treated as the configured source's newly resolved revision; there is no SemVer ordering across commits, so an operator must use an explicit source change when a controlled rollback is required. Content and keyword search switch together, while RAG catches up separately.

The static site may be newer or older than the console because the two publication paths are independent. This is deliberate: the static site's Release/publication contracts remain valid for visitor delivery, but they no longer define dynamic console freshness. Administrators receive source, synchronization, fallback, invalid-candidate, and RAG coverage details; visitors receive the adopted public content without operational warnings.

This decision supersedes the dynamic console source and deployed-pointer portions of [ADR 0011](./0011-published-playbook-read-model.md) and [ADR 0024](./0024-unified-search-and-playbook-sync-management.md). Their search aggregation, public rendering, and atomic projection consequences remain applicable where they do not conflict with this source boundary. The durable interface is defined in the [GitHub content source contract](../specs/style-playbook-integration/contracts/github-source.md).
