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
- Local memo helpers must normalize the primary configured root and derive:
  - memo draft path
  - new-file placeholder path
  - memo asset directory
  - relative file IDs
- Lower-case `/memos` remains supported when server-side flows read `LOCAL_MEMOS_PATH` and client editors read `NEXT_PUBLIC_LOCAL_MEMOS_PATH`.
- Memo-root helpers normalize slashless `LOCAL_MEMOS_PATH` and `NEXT_PUBLIC_LOCAL_MEMOS_PATH` primary entries into rooted paths before deriving memo file locations.

### 4.2 Editor and API behavior

- Local memo creation writes to the configured memo root instead of hard-coded `memos/`.
- Local memo attachment upload writes to `<memo-root>/assets/`.
- Client editors use the same memo-root helper for draft/article paths and upload paths.
- Generic editor type detection treats `Memos/*.md` as memo content.

### 4.3 Compatibility

- `inferContentType` and memo path detection are case-insensitive for `memos` roots.
- Shared content-path env parsing stays strict for non-memo settings; slashless normalization is limited to memo-root helpers.
- Memo-root helpers reject `.` or `..` path segments so local writes cannot escape the configured content base path.
- Disabled content sources fall back to default path mappings so stale env overrides for inactive sources do not block startup, including invalid client memo-root overrides.
- Legacy frontend memo routes still resolve image URLs into the configured local memo root.

## 5. Acceptance criteria

1. A local memo created after the fix lands under `Memos/*.md` by default.
2. A local inline image upload lands under `Memos/assets/*` and persists as a relative markdown link.
3. Opening `Memos/foo.md` in the generic editor keeps memo behavior instead of falling back to post behavior.
4. Unit tests cover uppercase local memo root helpers and uppercase memo type detection.
5. Slashless memo-root env overrides resolve to the same effective memo directory without relaxing validation for other content-path envs.
6. Invalid path overrides for disabled local or WebDAV sources do not fail module initialization.
7. Memo-root overrides reject `.` and `..` segments before any local file writes are derived.

## 6. Risks and rollback

### Risks

- Existing local dev/test fixtures created under lowercase `memos/` can drift from the new default.
- Any hidden code path that still hard-codes lowercase memo roots may only fail after deployment.

### Mitigations

- Centralize memo root helpers in one shared module.
- Update test-data generators and targeted regression tests alongside the code change.
- Fail fast when normalized local client/server memo roots resolve to different directories.
- Keep explicit `LOCAL_MEMOS_PATH=/memos` support for server-side helpers and `NEXT_PUBLIC_LOCAL_MEMOS_PATH=/memos` support for client editors.

### Rollback

- Revert the memo-root helper usage and restore the previous local memo root default.
- Repoint production bind mounts back to the previous lowercase destination and rerun sync if needed.

## 7. Change log

- 2026-03-10: Review hardening kept shared content-path env parsing strict while preserving slashless memo-root compatibility.
- 2026-03-10: Disabled source path parsing now ignores inactive-source overrides so stale env values do not break startup.
- 2026-03-10: Memo-root normalization now rejects dot segments before deriving local write paths.
- 2026-03-10: Disabled local mode now ignores invalid client memo-root overrides while keeping enabled local mode strict.
