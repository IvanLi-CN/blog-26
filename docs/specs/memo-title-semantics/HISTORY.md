# Memo Title Semantics History

> Topic lifecycle, compatibility, and necessary background only; the current requirements are in ./SPEC.md.

## Lifecycle / Compatibility

- None

## Replacements / Background

- The title-resolution contract is separated from the public Nature presentation contract so source parsing, public snapshots, and visitor-facing surfaces share one definition.

## Related Changes

- The inline Memo admin view keeps an absent title nullable in its admin-aware list and detail responses and preserves the empty title when PATCH saves a titleless Memo.

## References

- ./SPEC.md
- ./IMPLEMENTATION.md
