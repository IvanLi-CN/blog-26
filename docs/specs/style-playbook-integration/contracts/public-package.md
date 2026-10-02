# Public package and deployed edition

This contract is shared by the two repositories. It covers `REQ-PBI-002`, `REQ-PBI-003`, `REQ-PBI-007`, `REQ-PBI-008` and `REQ-PBI-010`.

## Release assets

`playbook-public.tar.gz` is a deterministic gzip/ustar archive with exactly two regular files at its root: `catalog.json` (complete upstream `PublicCatalog`) and `search-documents.json` (upstream public `SearchPayload`). No directory, link, PAX header, duplicate entry, absolute path, traversal, extra file or nonzero trailing data is accepted. The uncompressed archive is limited to 64 MiB. The reader parses bytes in memory; it never extracts or executes package content.

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

Size is UTF-8 byte size; hashes cover the exact uploaded bytes. Release ID is a decimal string. Commit is the tag's fully resolved 40-character commit. Stable tags are `v?MAJOR.MINOR.PATCH` without prerelease/build metadata. `publishedAt` must match GitHub's Release metadata exactly. Unknown schemas, fields, private/internal visibility, internal record keys, duplicate IDs, missing details, invalid relationships, nonpublic search targets or missing section anchors fail validation. Public project visibility may be null, matching the upstream public model; an explicit value must be `public`. Policy frontmatter visibility must be `public`. Policy resources must have unique safe relative paths and cannot replace `SKILL.md` or collide as file/directory paths.

The upstream remains responsible for its existing public text and URL/privacy checks. The consumer cannot infer unpublished knowledge from freeform prose and must never fetch private source Markdown. The consumer validator is [schema.ts](../../../../src/lib/playbook/schema.ts); the archive reader is [bundle.ts](../../../../src/lib/playbook/bundle.ts). A complete, controlled sample can be reproduced with `bun tests/lib/playbook-fixture.ts <output-directory>`; source objects are in [fixture.ts](../../../../src/lib/playbook/fixture.ts).

## Published edition

The blog publishes `/_content/playbook/manifest.json` and immutable `/_content/playbook/<tag>/<editionDigest>/`. The pointer is the edition identity defined by [types.ts](../../../../src/lib/playbook/types.ts). Its file records cover normalized `catalog.json`, `search-documents.json`, and the independent article/Memo `public-snapshot.json`. It also records `rendererCommit`, `contentSnapshotIdentity`, the original source/bundle identity, `generatedAt` and an optional previous `{tag, editionDigest}`.

`editionDigest` is SHA-256 of the compact JSON record `{bundleDigest, rendererCommit, files}`. File records are sorted by path, and their keys are exactly `path`, `sha256`, `size` in that order. Normalized JSON uses recursively sorted object keys, two-space indentation and a final newline; arrays retain their semantic order. The content snapshot record makes a changed article/Memo snapshot produce a distinct immutable URL. Identical public content may have an identical digest at different source tags; adoption and deployment verification also compare the full source identity.

The directory includes `edition.json`, both original Release assets, the three public JSON files, and `policies/<slug>/SKILL.md` plus catalog resources. Policy downloads are served as plain text attachments; Markdown is sanitized through the existing renderer. Current and previous version directories and original archives are rebuilt/retained in each complete static deployment. The pointer revalidates; version files cache for one year as immutable. The manifest is written last in the build tree and becomes visible with the same whole-site deployment as the pages.

The static search island reads this edition's exact immutable search file. Console's `GET /api/public/playbook/search-index?edition=<digest>` returns the exact normalized search bytes from current/previous persistent snapshots, or HTTP 409 for an unknown edition. Console resources use `/api/public/playbook/resource?edition=<digest>&policy=<slug>&path=<relative-path>` and do not require source credentials. Page requests never contact the upstream.
