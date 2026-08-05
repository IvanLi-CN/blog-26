# Content Relative Paths

## Background

Persisted Markdown and metadata must remain independent of machine-specific content roots and public delivery URLs.

## Contract

- Persisted content and metadata store normalized relative asset paths.
- Markdown asset references remain relative to the content file that owns them.
- `LOCAL_CONTENT_BASE_PATH` is the only configured filesystem content root.
- Runtime file access resolves local assets through `/api/files/local/...` beneath that root.
- Public consumers receive blog-owned stable asset-facade URLs rather than raw filesystem paths.
- Remote content-source compatibility is not part of the current repository contract.

## Acceptance Criteria

- Moving the configured local content root does not require rewriting persisted Markdown.
- Public responses do not disclose local absolute paths.
- Runtime resolution rejects path traversal outside the configured content root.

## References

- [Public media assets facade](../public-media-assets-facade/SPEC.md)
- `docs/runbooks/fs-only-migration.md`
