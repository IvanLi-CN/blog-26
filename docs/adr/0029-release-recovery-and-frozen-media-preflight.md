---
status: accepted
---

# Release Recovery and Frozen Media Preflight

## Context

Product Release previously treated a failure after frozen inputs as an ordinary manual-release retry. The runbook could direct an operator to abandon the identity even while the frozen inputs artifact was still available, consuming the reserved version and losing the only safe same-identity recovery target. Failure records also stored the ledger stage rather than the workflow boundary that failed. Static media closure was discovered during the combined static/image build, so a missing or uncovered media file caused a late failure without a reusable proof that the frozen inputs had been checked.

## Decision

- Product Release recovery uses the original Product Release run as the single execution identity. `retry-product-release.yml` accepts only `release_id`, validates the ledger entry and the exact original run repository, workflow path, main branch, merge SHA, stage and conclusion, then calls GitHub's rerun API. It never accepts version, source or artifact parameters, creates a successor reservation, or copies an artifact to a new run.
- A failure record keeps the old string phase format readable and adds the fixed phase vocabulary, actual workflow step, original run ID and run attempt. Failure notifications expose the version, identity, source and merge SHA, run URL, attempt, phase, step and same-identity recovery operation. Successful progress removes the stale failure record. The existing Oidrune notification transport and its trust boundary remain unchanged.
- Manual takeover remains available only for a failed or cancelled run with no frozen artifacts. An input-only abandon is rejected while the inputs artifact is available; the emergency path requires GitHub evidence that the artifact is missing or expired, no products, explicit loss confirmation and an incident reason. An abandoned identity cannot be revived or reallocated.
- After inputs are recorded and before image packaging, Product Release runs a deterministic frozen-media preflight using the same frozen snapshot, media manifest and build configuration. It produces a static output proof bound to the release identity, merge source SHA and inputs manifest digest. The image build may reuse only a matching proof; the proof is ephemeral and can be rebuilt during the original run's rerun, while retained inputs and products remain immutable 90-day artifacts.
- Frozen input acquisition remains pinned to the registered source tooling. For preflight and image packaging, the workflow may apply the current verified Playbook compatibility tooling so historical frozen catalogs can be validated without changing the release identity, source SHA or input bytes.
- The preflight is a post-merge Product Release gate. It does not become a PR or main required check, and it does not change the static frontend, full-feature image, EdgeOne, GHCR or release channel contracts.

## Consequences

Operators have one actionable recovery target that preserves version, release identity, merge SHA and frozen artifact digests. The ledger and notification evidence now identify the failing workflow boundary and the permitted recovery action. Static media gaps fail before image packaging and the validated static output is not rebuilt a second time in the same attempt. Recovery remains fail-closed when a retained artifact is expired, removed or provenance-conflicted, and the real GitHub Actions rerun behavior still requires an empirical non-production drill.

## Rejected alternatives

- Creating a new manual Product Release run and copying frozen artifacts would create a second run identity and weaken the audit link between the ledger and the original workflow.
- Abandoning every input-only failure would destroy a recoverable frozen input set and force an unnecessary new version reservation.
- Recording only the ledger stage or parsing workflow YAML would not identify the actual failed boundary or prove runtime recovery behavior.
- Moving frozen-media preflight into PR or main required checks would turn a post-merge release concern into a release-coupled code gate and change the existing quality-gate contract.
