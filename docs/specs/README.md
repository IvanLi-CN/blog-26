# Specs Overview

`docs/specs/` is the primary source of truth for executable specs in normal/fast-track flows.
Legacy plans in `docs/plan/` remain readable but are no longer the preferred place for new work.

## Status

- `draft`: scope and acceptance are still changing.
- `ready`: scope and acceptance are frozen; implementation can start.
- `in-progress`: implementation is ongoing.
- `done`: implementation and verification are complete.
- `superseded`: replaced by another spec.

## Index

| ID | Title | Status | Spec | Last | Notes |
|---|---|---|---|---|---|
| ey3mm | PR + label driven release | in-progress | `ey3mm-pr-label-release/SPEC.md` | 2026-03-03 | Introduce deterministic release gate from PR labels and channel. |
| m4c9u | Local memo root keeps `Memos` case | done | `m4c9u-local-memos-root-case/SPEC.md` | 2026-03-10 | Keep local memo writes aligned with the synced `Memos` tree, keep active env parsing strict, ignore inactive-source client overrides, and block dot-segment memo roots. |
