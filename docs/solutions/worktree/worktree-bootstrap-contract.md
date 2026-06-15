---
title: "Linked worktree bootstrap contract"
module: "developer-workflow"
problem_type: "worktree-bootstrap"
component: "git-hooks, local-dev-env, port-leases"
tags:
  - worktree
  - bootstrap
  - lefthook
  - local-dev
status: "active"
related_specs: []
symptoms:
  - "New linked worktrees require maintainers to remember a manual setup checklist before local development works."
  - "Worktrees collide on the default dev ports and silently reuse stale local runtime assumptions."
  - "Hook installation and local env bootstrap drift because setup logic only lives in one manual entrypoint."
root_cause: "The repository treated setup as a one-shot manual script instead of a worktree-aware contract tied to Git checkout lifecycle and global port ownership."
resolution_type: "post-checkout bootstrap contract"
---

# Context

The repository now treats linked worktree readiness as an explicit Git-level contract. A new worktree should become locally runnable after its first checkout without relying on Codex-only behavior or a maintainer remembering an onboarding sequence.

# Symptoms

- `git worktree add` succeeds, but the new worktree still lacks local env defaults and setup state.
- Multiple worktrees compete for `25090/25093/25094` because the old defaults were never worktree-aware.
- Developers rerun setup manually on every branch switch because the repo had no durable “first checkout only” bootstrap marker.

# Root cause

The previous flow concentrated all setup logic in `scripts/setup.sh`. That script installed hooks, validated a single default port, and seeded local data, but it was not connected to `post-checkout`, had no first-run marker, and did not cooperate with the global port registry contract required for multiple linked worktrees.

# Resolution

1. Split setup into a reusable `scripts/worktree-bootstrap.sh` entrypoint plus a small shared shell library.
2. Hook `lefthook post-checkout` to `scripts/post-checkout-worktree-bootstrap.sh`.
3. Auto-run bootstrap only on the first linked-worktree checkout: null previous ref + branch checkout + no bootstrap marker.
4. Generate `.env.local` only when it does not already exist; never overwrite an existing local file.
5. Accept older preserved `.env.local` files that only define `PORT`; derive `SITE_PORT` / `ADMIN_PORT` at runtime instead of breaking setup for existing checkouts.
6. Lease worktree-specific ports through the repository-owned `scripts/port-registry.py` helper and write `PORT`, `SITE_PORT`, and `ADMIN_PORT` into the initial `.env.local`.
7. Keep failure non-blocking for Git operations: failed auto bootstrap prints a structured warning and one recovery command, but checkout still succeeds.
8. Preserve an explicit rerun path through `bun run worktree:bootstrap -- --force`.
9. Keep `--dry-run` read-only: no `.env.local` creation and no port-registry mutations.
10. Treat generated dev fixtures as repo-managed data only: if `LOCAL_CONTENT_BASE_PATH` points outside `./dev-data`, bootstrap skips fixture generation and syncs the existing real content root instead.
11. Add a linked-worktree smoke test that exercises first-run bootstrap, existing `.env.local` preservation, legacy env compatibility, non-rerun on later branch switches, dry-run non-mutation, real-root fixture guardrails, and degraded hook failure behavior.

# Guardrails / Reuse notes

- Treat the linked-worktree marker as Git-dir state, not worktree-file state, so linked worktrees with `.git` files still work.
- Worktree bootstrap may prepare local dependencies and fixture data, but it must not start long-lived preview servers.
- `.env.local` stays user-owned once created; future automation can read it, but must not silently merge or rewrite it.
- The port registry data remains the source of truth for worktree-local default ports, but the helper that manages it must live in the repository so CI and non-Codex contributors can run the same bootstrap contract.
- Dev fixture generation is only safe for repo-managed scratch roots under `./dev-data`; real local content roots must be synchronized, not cleaned and repopulated with demo files.
- A smoke test is mandatory; otherwise hook-based bootstrap paths will silently rot because unit tests never traverse `git worktree add`.

# References

- `scripts/worktree-bootstrap.sh`
- `scripts/post-checkout-worktree-bootstrap.sh`
- `scripts/test-worktree-bootstrap.sh`
- `lefthook.yml`
- `README.md`
