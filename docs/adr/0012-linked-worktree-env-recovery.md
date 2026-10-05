---
status: accepted
---

# Linked Worktree Environment Recovery

When a linked worktree lacks `.env.local`, bootstrap inherits the primary worktree's complete local environment file, including secret-like values, because the purpose is to recover the same local development configuration without a second manual secret setup. The target remains user-owned once created: bootstrap never overwrites or merges it, never emits its values, and rewrites only `PORT`, `SITE_PORT`, and `ADMIN_PORT` to preserve worktree port isolation; database, content, and other path values remain literal local overrides.

## Considered Options

- Filter secret-like variables while copying: rejected because it makes the recovered environment incomplete and requires a second undocumented secret-provisioning path.
- Copy primary ports and paths literally: rejected for ports because linked worktrees must not reuse the primary lease; path rewriting was also rejected because absolute paths may intentionally point to shared or external resources.
- Fail whenever the primary source is unavailable: rejected for missing or unusable source state because the existing generated-default environment is a safe degraded path; operational publication failures still remain strict for manual bootstrap.

## Consequences

- A local secret may exist in more than one ignored worktree file. This is an explicit local-machine trade-off, not a remote secret-management contract.
- Port allocation remains worktree-specific and continues to use the repository-owned port registry.
- Relative database and content paths remain isolated by normal worktree-relative resolution; absolute paths remain the maintainer's explicit sharing decision.
- Recovery behavior must be protected by a real linked-worktree smoke test and must keep automatic hook failures non-blocking.
