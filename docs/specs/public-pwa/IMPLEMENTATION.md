# Public Blog Logo Assets and Online-First PWA Implementation

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: Public-only install metadata and online-first caching.

## Implementation Coverage

- Requirement coverage: `REQ-PWA-001` and `REQ-PWA-002` are implemented by the approved brand masters, deterministic icon generator, and asset verifier. `REQ-PWA-003` and `REQ-PWA-004` are implemented by the public Astro manifest and theme-color synchronization, including system color-scheme changes. `REQ-PWA-005` and `REQ-PWA-006` are implemented by the Bun gateway cache policy and generated EdgeOne route configuration, which rejects unclassified non-error HTML outputs, groups nested tag feed XML under one revalidation rule separate from tag HTML paths, groups root-level favicon/feed/file assets without matching API or gateway paths, keeps project asset rules suffix-scoped so they do not shadow HTML routes, stays within the 30-rule platform limit, and applies immutable caching only to digest-qualified install asset directories. The release workflow verifies that staged EdgeOne static files match the packaged site output by path and SHA-256, excluding EdgeOne-specific functions/config, and that `edgeone-dist/edgeone.json` matches generated cache rules; it also runs media-manifest/quota checks against the final directory. `REQ-PWA-007` is covered by source, asset, manifest, cache-policy, EdgeOne artifact tests, and the icon preview.
- Repeatable checks: `bun run test:public-pwa`, `bun run verify:public-pwa`, `bun run check`, and `bun run site:build`.
- Base-path build check: run `bun run site:build` with `PUBLIC_SITE_BASE_PATH` set to the deployment prefix, and with the repository's normal `DB_PATH`, `LOCAL_CONTENT_BASE_PATH`, and `CONTENT_SOURCES=local` build environment.
- Browser check: inspect the root and base-path manifests and icon URLs; change the OS color scheme while system theme is selected, toggle light/dark themes, and navigate between Astro pages; verify public HTML, versioned assets, stable assets, and API/admin response cache headers.
## Coverage / rollout summary

- Public install metadata and generated icons are available at build time. Browsing and content remain online-first; no Service Worker or offline-reading behavior is included.
- Stable frontend releases publish the verified static artifact to EdgeOne Makers and attach the site archive and checksum to the matching frontend GitHub Release.

## Remaining Gaps

- No in-scope implementation gaps remain.

## Related Changes

- None.

## References

- `./SPEC.md`
- `./HISTORY.md`
