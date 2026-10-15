---
status: accepted
---

# Attest Exact Release Evaluations on the Preparation PR

The release preparation PR is created by the repository's built-in `GITHUB_TOKEN`. GitHub does not reliably start a `pull_request` workflow from an event created by that token, and a successful `workflow_dispatch` run on the same commit is not automatically included in the PR's required-check rollup. The merge followup therefore waits for the exact preparation-head CI and E2E dispatches, verifies the release ledger identity and PR provenance again, and uses the same Actions installation identity to publish PR-associated successful check runs with the required job names.

## Decision

- Keep the built-in `GITHUB_TOKEN` and `github-actions[bot]` as the only release identity.
- Dispatch CI and E2E explicitly for the preparation head, and accept only completed successful jobs whose SHA, workflow, branch, and repository match the registered identity.
- Publish one idempotent check-run attestation per required PR job through the Checks API only after those evaluations pass. The attestation carries the release identity, an external ID, and the preparation PR URL.
- Observe native protected auto-merge after the attestations are visible. The followup never calls an approval endpoint and never bypasses branch protection.

## Rejected Alternatives

- **GitHub App installation token or PAT**: rejected because the release contract forbids new credentials and the repository already has an approved built-in-token identity.
- **Approval API or branch-protection bypass**: rejected because it would change the protected merge boundary and conceal failed required checks.
- **Privileged `pull_request_target` execution of the candidate**: rejected because it would expose a privileged workflow context to untrusted candidate code and would not preserve the existing exact-head evaluation contract.

## Consequences

The merge followup has an explicit `workflow_dispatch` input contract and needs job-level `checks: write` permission. Check publication is safe to retry because the external ID is derived from the immutable release identity and required check name. A failed, stale, moved, or unregistered preparation cannot publish an attestation or proceed to merge.
