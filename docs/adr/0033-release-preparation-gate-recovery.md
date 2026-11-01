---
status: accepted
---

# Recover a Merged Preparation That Fails Before Product Release

## Context

A release preparation PR can merge successfully while an exact main CI/E2E
evaluation for that merge SHA fails. The release ledger remains at `pr_open`
because Product Release correctly refuses to bind an identity without all main
required checks. Existing abandon workflows begin only after Product Release
has a `merged` ledger entry, so this state can strand the reservation and block
the next release.

## Decision

- Add a dedicated GitHub Actions recovery workflow that accepts only the
  registered `release_id` and an incident reason.
- Before writing the ledger, the workflow must re-read the registered PR and
  prove its exact signed VERSION-only merge, verify that the exact main CI/E2E
  evaluations are terminally failed, and reject pending or successful checks.
- The workflow must reject any identity that has a Product Release run, frozen
  artifact, GitHub Release, or publication proof. It writes an Actions-signed
  `abandoned` ledger state, burning the reserved version.
- The operator then starts a fresh Manual Product Release request. The version
  allocator advances past the abandoned version; no source, VERSION commit,
  artifact, or product is reused.

## Rejected alternatives

- Retrying Product Release is invalid because no Product Release identity was
  bound and the exact main gate has already failed.
- Manually editing `release-ledger` would lose the required GitHub Actions
  signature and compare-and-swap provenance.
- Treating the failed merge as publishable would bypass the main quality gate.
- Reusing the same version would make the abandoned reservation ambiguous and
  weaken the monotonic allocation contract.

## Consequences

The release system has a fail-closed recovery path for the pre-publication
failure boundary without widening Product Release recovery or permitting
artifact copying. A failed exact main evaluation is preserved in the ledger
failure context, while the incident reason remains in the workflow audit log.
