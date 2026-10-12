# ADR 0008: Dependency Freshness Is Not a CI Gate

- Status: accepted

The `bun outdated` result measures registry freshness, not reproducible installation, application correctness, or known security exposure. Treating available non-major updates as a required CI failure blocked the release path even when frozen installation, unit tests, worktree bootstrap, and E2E checks passed.

Remove the dependency freshness check from CI entirely. Keep `bun install --frozen-lockfile` and the existing functional quality gates blocking, and do not change dependency declarations or `bun.lock` as part of this policy decision. Recover the skipped frontend publication only after this policy change is merged, using the then-current labeled release flow from the then-current `main` head rather than publishing the historical SHA manually. This last step is historical evidence for the procedure in force when this ADR was accepted: commit `260692f8be487574ee6227c81f65be4a576a2f6a` later retired that label-driven flow and its label-gate/release workflows. The current release entry is `.github/workflows/manual-product-release.yml`, and `.github/workflows/product-release.yml` consumes the registered release.
