#!/usr/bin/env bash
set -euo pipefail

# Run only the two failing suites to speed up bisect
# Return 0 when tests pass, 1 when fail (so bisect can classify good/bad)

run() {
  bun run test:e2e -- --project=guest-chromium tests/e2e/guest/code-block-rendering.spec.ts && \
  bun run test:e2e -- --project=admin-chromium tests/e2e/admin/pats-admin.spec.ts
}

run
