# ADR 0008: Dependency Freshness Is Not a CI Gate

- Status: accepted

The `bun outdated` result measures registry freshness, not reproducible installation, application correctness, or known security exposure. Treating available non-major updates as a required CI failure blocked the release path even when frozen installation, unit tests, worktree bootstrap, and E2E checks passed.

Remove the dependency freshness check from CI entirely. Keep `bun install --frozen-lockfile` and the existing functional quality gates blocking, and do not change dependency declarations or `bun.lock` as part of this policy decision. Recover the skipped frontend publication only after this policy change is merged, using the normal labeled release flow from the then-current `main` head rather than publishing the historical SHA manually.
