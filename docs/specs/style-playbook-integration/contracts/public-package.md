# Public package and deployed edition

This contract is shared by the two repositories. It covers `REQ-PBI-002`, `REQ-PBI-003`, `REQ-PBI-007`, `REQ-PBI-008` and `REQ-PBI-010`.

## Release assets

`playbook-public.tar.gz` is a deterministic single-member gzip/ustar archive with exactly two regular files at its root, in this order: `catalog.json` (complete upstream `PublicCatalog`) followed by `search-documents.json` (upstream public `SearchPayload`). The gzip header has no optional fields and uses fixed `XFL=2` and `OS=255`; gzip and ustar entry timestamps, modes, ownership and link fields use the source commit timestamp and fixed zero/empty metadata. Ustar name fields must contain the exact canonical file names with zero-filled remainder and no `./` normalization; numeric fields, type flags, reserved bytes and entry padding use their canonical encoding, the ustar stream uses version `00`, and it ends with at least two complete zero blocks. No directory, link, PAX header, duplicate entry, absolute path, traversal, extra file or nonzero trailing data is accepted. The uncompressed archive is limited to 64 MiB. The reader parses bytes in memory; it never extracts or executes package content.

Publish `playbook-public-manifest.json` **last**, after checking the uploaded archive's digest and size. Repeating a release must verify existing assets; a different digest at the same release identity is an error. Archive metadata and payload timestamps must come from the source commit, not the export clock. Release metadata belongs to the separate readiness manifest, so the archive does not contain its own digest.

```json
{
  "schemaVersion": 1,
  "source": {
    "repository": "IvanLi-CN/style-playbook-skills",
    "releaseId": "100",
    "tag": "v3.0.0",
    "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "publishedAt": "2026-09-01T00:00:00Z"
  },
  "bundle": { "name": "playbook-public.tar.gz", "sha256": "<64 lowercase hex>", "size": 1234 },
  "files": [
    { "path": "catalog.json", "sha256": "<64 lowercase hex>", "size": 1234 },
    { "path": "search-documents.json", "sha256": "<64 lowercase hex>", "size": 1234 }
  ]
}
```

Size is UTF-8 byte size; hashes cover the exact uploaded bytes. Release ID is a decimal string. Commit is the tag's fully resolved 40-character commit. Stable tags are `v?MAJOR.MINOR.PATCH` without prerelease/build metadata. `publishedAt` must match GitHub's Release metadata exactly. Unknown schemas, fields, private/internal visibility, internal record keys, duplicate IDs, missing details, invalid relationships, nonpublic search targets or missing section anchors fail validation. Every public project record must include `catalog_visibility: public` and `source_visibility: public|private`; a source-private/catalog-public project exposes the literal `source: private` marker. Topic `catalog_visibility` is independent of all project visibility fields and is validated separately. Policy frontmatter visibility must be `public`. Policy resources must have unique safe relative paths and cannot replace `SKILL.md` or collide as file/directory paths.

## Private supplement

When a Release contains non-public organized knowledge, it publishes the paired `playbook-private-supplement.tar.gz` and `playbook-private-supplement-manifest.json` assets. The supplement has the same fixed root shape as the public package, is source-bound to the exact public manifest identity, and is an overlay: it does not repeat public records or public prose. It may contain catalog-private projects/topics, omitted relation edges, and `private_source_metadata`; a private source URL is allowed only in that metadata field and never in the public package.

The Blog validates the supplement before deployment and sends the derived `playbook-private-supplement.json` projection, the same-source public relation index, and base64-encoded original `catalog.json` and `search-documents.json` bytes through the protected `/api/admin/playbook/supplement` receiver. The receiver verifies those bytes against the supplement manifest, compares their decoded structures with the submitted projection, and checks every cross-package relation against the public relation index before persisting the source-bound projection for the backend/admin runtime; a relation conflict is rejected without deleting an already valid overlay. The supplement is not copied into frozen product inputs, `backend-dist`, the public GHCR image, the public static artifact, public pointer, anonymous public API, or public search index. Admin browsing and search use an authenticated `GET /api/admin/playbook` read model that merges the public catalog with a source-matching supplement after the public pointer is adopted. Missing, malformed, conflicting, duplicate, or source-mismatched supplement data is rejected or ignored as an admin overlay; it never weakens the public edition.

For a legacy public edition, the consumer verifies the downloaded catalog/search bytes against the legacy file records before normalizing only the in-memory read model; the retained edition identity carries those verified raw bytes into the internal seed and persisted cache marker, so the historical package remains reproducible and revalidated across adoption and restart.

The upstream remains responsible for its existing public text and URL/privacy checks. The consumer cannot infer unpublished knowledge from freeform prose and must never fetch private source Markdown. The consumer validator is [schema.ts](../../../../src/lib/playbook/schema.ts); the archive reader is [bundle.ts](../../../../src/lib/playbook/bundle.ts). A complete, controlled sample can be reproduced with `bun tests/lib/playbook-fixture.ts <output-directory>`; source objects are in [fixture.ts](../../../../src/lib/playbook/fixture.ts).

Internal record keys are matched recursively after removing punctuation and folding case, including camelCase variants. Freeform Policy frontmatter and project stack records share the complete internal metadata exclusions; credential terms and compound credential key names also fail validation. Fixed public fields such as a Topic's `token` retain their typed meaning. Resource paths below `SKILL.md/` are also reserved. Incoming public Policy search pages are accepted; the consumer ensures one complete canonical `policy:<slug>` instruction document and rejects conflicting IDs. Search anchors must identify rendered sections; Policy pages expose `installation` and, when resources exist, `resources`.

## Published edition

The blog publishes `/_content/playbook/manifest.json` and immutable `/_content/playbook/<tag>/<editionDigest>/`. The pointer is the edition identity defined by [types.ts](../../../../src/lib/playbook/types.ts). Its file records cover normalized `catalog.json`, `search-documents.json`, and the independent article/Memo `public-snapshot.json`. It also records `rendererCommit`, the verified source commit timestamp when available, `contentSnapshotIdentity`, the original source/bundle identity, `generatedAt` and an optional previous `{tag, editionDigest}`. Legacy pointers may omit the timestamp while new source acquisitions carry it into local archive revalidation.

`editionDigest` is SHA-256 of the compact JSON record `{bundleDigest, rendererCommit, files}` plus `sourceTimestamp` when that field is present. File records are sorted by path, and their keys are exactly `path`, `sha256`, `size` in that order. Normalized JSON uses recursively sorted object keys, two-space indentation and a final newline; arrays retain their semantic order. The content snapshot record makes a changed article/Memo snapshot produce a distinct immutable URL. Identical public content may have an identical digest at different source tags; adoption and deployment verification also compare the full source identity.

The directory includes `edition.json`, both original public Release assets, the three public JSON files, and `policies/<slug>/SKILL.md` plus catalog resources. Policy downloads are served as plain text attachments; the existing page renderer may apply its normal HTML safety behavior, while the Blog package receiver performs no body sanitizer, section filtering, title rewrite, or prose rewrite. Current and previous version directories and original public archives are rebuilt/retained in each complete static deployment. The pointer revalidates; version files cache for one year as immutable. The manifest is written last in the build tree and becomes visible with the same whole-site deployment as the pages.

The unified server search validates this edition's catalog, search documents and public resource text, then atomically adopts the content and lexical search projection. Semantic projection is prepared asynchronously from the same adopted edition and is not an adoption prerequisite; missing, failed or cancelled embeddings leave the adopted content queryable and are reported as incomplete coverage. If the published search payload omits resource bodies, the consumer derives those documents from the same catalog without changing the original assets or fetching private source files. Static and console search pages pass their bound edition, Release ID and tag to the [unified search contract](../../search-relevance/contracts/unified-search.md); they do not merge independently ranked client results.

Console's compatibility `GET /api/public/playbook/search-index?edition=<digest>&sourceReleaseId=<release-id>&sourceTag=<tag>` still returns the exact normalized search bytes from the matching current/previous persistent snapshot, or HTTP 409 for an unknown edition. Console resources use the same source-bound selector in `/api/public/playbook/resource?edition=<digest>&sourceReleaseId=<release-id>&sourceTag=<tag>&policy=<slug>&path=<relative-path>` and do not require source credentials. The persistent cache retains source-distinct current/previous identities even when their digests match; every console read carries the Release ID and tag so the selected build identity remains observable. Page requests never contact the upstream.
