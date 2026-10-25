# GitHub content source contract

This contract defines the dynamic Playbook source and covers `REQ-PBI-008`, `REQ-PBI-009`, `REQ-PBI-018`, `REQ-PBI-019` and `REQ-PBI-020`. The static site's public package and Release trigger contracts remain separate publication contracts and are not dynamic input contracts.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `STYLE_PLAYBOOK_GITHUB_TOKEN` | none | Server-only GitHub read credential. Missing means `unconfigured`; it must never reach a browser, rendered page or ordinary log. |
| `STYLE_PLAYBOOK_GITHUB_REPOSITORY` | `IvanLi-CN/style-playbook-skills` | Exact GitHub repository identity. |
| `STYLE_PLAYBOOK_GITHUB_REF` | `main` | Branch, tag or commit selected as the configured source revision. |

`PLAYBOOK_SOURCE_TOKEN`, `GH_TOKEN` and `PLAYBOOK_SYNC_ENABLED` are not part of this provider contract. Provider configuration does not control whether the static site is published, and the absence of a dynamic source does not delete an already adopted database snapshot.

## Read and validation boundary

The provider resolves the configured ref to one commit SHA, then reads the fixed public export defined by the upstream export contract at that commit. The export must contain a complete catalog, bodies, public resources and search documents from the same commit. The provider does not scan arbitrary repository paths, fetch the static site, consume a deployed pointer, consume Release assets, follow links to private files, or mix files from multiple revisions.

Validation rejects missing or malformed export data, unknown or conflicting visibility, private or internal records, unsafe resource paths, incomplete content, and any digest mismatch. The provider computes a deterministic content snapshot hash over the normalized catalog, bodies, public resources and search documents. A source read failure is `failed`; a structurally or publicly invalid candidate is `invalid`; neither replaces the adopted snapshot.

The dynamic source allowlist is exactly the following GitHub Contents API paths, all read at the resolved commit SHA:

- `public/playbook/manifest.json` records `schemaVersion=1`, the normalized snapshot `contentHash`, and the SHA-256 plus byte size of the two data files.
- `public/playbook/catalog.json` is the complete normalized public catalog, including readable bodies, public resources and the public relationships required by the blog.
- `public/playbook/search-documents.json` is the complete public lexical-search projection for that same catalog.

The provider requests no other paths and never uses `web/.generated`, `web/dist-public`, a static-site URL, a deployed pointer, or Release assets as this dynamic input. JSON bytes are canonicalized by the application contract before file and snapshot hashes are computed. The normalized content hash excludes exporter generation timestamps (`catalog.snapshot.index.generated_at` and `search.generated_at`) so timestamp-only regeneration is a provenance change, not a content rebuild. The export manifest's file order and paths are fixed; a missing file, extra manifest entry, malformed digest, invalid UTF-8/JSON, schema failure or public-boundary violation makes the candidate `invalid`.

## Comparison and adoption

| Source result | Dynamic outcome |
| --- | --- |
| Same commit SHA and same content hash | `current`; no content or index rebuild. |
| Different commit SHA and same content hash | Treat the candidate as `stale` until adopted; then update source provenance while keeping the content snapshot and keyword/RAG targets without rebuilding them. |
| Different commit SHA and different content hash | Candidate is `stale` relative to the adopted snapshot; after validation, atomically adopt the complete content and keyword projection, then prepare RAG asynchronously. |
| Missing token | `unconfigured`; retain the adopted snapshot. |
| GitHub request or transient network failure | `failed`; bounded retry may occur outside the request path, then retain the adopted snapshot. |
| Invalid export, public-boundary violation or hash inconsistency | `invalid`; do not retry blindly and retain the adopted snapshot. |

The database keeps only the current and previous complete snapshots for ordinary reads and recovery. It does not provide automatic version selection or history browsing. The current snapshot remains readable while a candidate is stale, being checked, failed or invalid. When no valid current snapshot exists, the service reports Playbook unavailable instead of returning an empty successful result.

## Scheduling, visibility and ownership

The service checks the source at startup, on a configurable background interval whose default is five minutes, and through an administrator-triggered asynchronous check. A public read never calls GitHub or waits for a check. A logical source has one active task, an owner token and lease, bounded transient retries, durable status and failure details, and recovery for an expired lease. Manual and automatic checks share the same adoption fence.

Source status, last check, last successful adoption, configured ref, resolved commit, content hash, fallback reason and RAG coverage are administrator-only. Visitors receive the adopted public content without source credentials, upstream errors, stale notices or semantic-coverage warnings. Logs contain controlled error details but no credentials or unrelated source prose.

## Provider boundary

The provider interface returns a normalized complete public snapshot, source revision, content hash and observable failure state. GitHub is the only configured provider now. A future provider may be selected per collection, but database snapshot retention is not a provider and the static public site is not one.
