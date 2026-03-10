# SPEC: Local Memo Root Keeps `Memos` Case

- Spec ID: `m4c9u`
- Status: `done`
- Last Updated: `2026-03-10`
- Owner: `main-agent`

## 1. Background

Production has already switched the blog content source from WebDAV to local bind mounts.
The real upstream note tree stores memos under `Memos/`, but several local-only code paths still hard-code lowercase `memos/`.
That mismatch splits new memo writes and attachment uploads away from the synced source tree.

## 2. Goals

1. Keep local memo write paths aligned with the real `Memos/` directory.
2. Preserve memo route URLs as `/memos/<slug>` while allowing uppercase on-disk roots.
3. Make memo creation, inline uploads, and generic editor type detection case-safe.
4. Keep lower-case memo roots configurable for explicit dev/test overrides, including client editors.

## 3. Non-goals

- No change to public memo page routes or permalink structure.
- No rewrite of existing memo markdown contents beyond path normalization needed for new writes.
- No change to post/project directory conventions.

## 4. Contract

### 4.1 Local memo root

- Default local memo root becomes `/Memos`.
- Local memo helpers must normalize configured roots and derive:
  - memo draft path
  - new-file placeholder path
  - memo asset directory
  - relative file IDs
- Lower-case `/memos` remains supported when `LOCAL_MEMOS_PATH` is set for server flows and `NEXT_PUBLIC_LOCAL_MEMOS_PATH` is set for client editors.

### 4.2 Editor and API behavior

- Local memo creation writes to the configured memo root instead of hard-coded `memos/`.
- Local memo attachment upload writes to `<memo-root>/assets/`.
- Client editors use the same memo-root helper for draft/article paths and upload paths.
- Generic editor type detection treats `Memos/*.md` as memo content.

### 4.3 Compatibility

- `inferContentType` and memo path detection are case-insensitive for `memos` roots.
- Legacy frontend memo routes still resolve image URLs into the configured local memo root.

## 5. Acceptance criteria

1. A local memo created after the fix lands under `Memos/*.md` by default.
2. A local inline image upload lands under `Memos/assets/*` and persists as a relative markdown link.
3. Opening `Memos/foo.md` in the generic editor keeps memo behavior instead of falling back to post behavior.
4. Unit tests cover uppercase local memo root helpers and uppercase memo type detection.

## 6. Risks and rollback

### Risks

- Existing local dev/test fixtures created under lowercase `memos/` can drift from the new default.
- Any hidden code path that still hard-codes lowercase memo roots may only fail after deployment.

### Mitigations

- Centralize memo root helpers in one shared module.
- Update test-data generators and targeted regression tests alongside the code change.
- Keep explicit `LOCAL_MEMOS_PATH=/memos` plus `NEXT_PUBLIC_LOCAL_MEMOS_PATH=/memos` fallback support for full-stack overrides.

### Rollback

- Revert the memo-root helper usage and restore the previous local memo root default.
- Repoint production bind mounts back to the previous lowercase destination and rerun sync if needed.
