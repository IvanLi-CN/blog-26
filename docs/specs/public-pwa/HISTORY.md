# Public Blog Logo Assets and Online-First PWA History

## Lifecycle / Compatibility

- None

## Replacements / Background

- The topic keeps the approved public brand mark as its source and records the online-first boundary; installability does not imply offline reading.

## Related Changes

- Root-level public files use bounded filename-prefix groups plus exact paths; explicit Post and Memo page rules precede overlapping asset rules, exact feed rules keep their revalidation policy, and dynamic API, admin, and `/mcp` paths remain outside the cache rules while the generated configuration stays within EdgeOne's header-rule limit.
- [PR #149](https://github.com/IvanLi-CN/blog-26/pull/149) records the repair for release run [#37121485767](https://github.com/IvanLi-CN/blog-26/actions/runs/37121485767); fix commit [`871b248`](https://github.com/IvanLi-CN/blog-26/commit/871b248b307087a9b8c746d6fc3ba402b34429db) restores Post and Memo page precedence, with four Tier 3 lanes clear on that code candidate.
- Record PR, commit, review, and compatibility references here; do not add task history to `SPEC.md`.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
